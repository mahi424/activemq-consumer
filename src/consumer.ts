import {
  Client,
  StompConfig,
  StompHeaders,
  IMessage,
  IFrame,
} from '@stomp/stompjs';
import { EventEmitter } from 'events';
import * as Debug from 'debug';
import { WebSocket } from 'ws';

import { TimeoutResponse, ConsumerOptions, Events } from './interfaces';
import { autoBind } from './bind';
import { TimeoutError } from './errors';

const debug = Debug('activemq-consumer');
// const debug = debug;
Object.assign(global, { WebSocket: WebSocket }).WebSocket;

const requiredOptions = [
  'destination',
  // only one of handleMessage / handleMessagesBatch is required
  'handleMessage|handleMessageBatch',
];

function createTimeout(duration: number): TimeoutResponse[] {
  let timeout;
  const pending = new Promise((_, reject) => {
    timeout = setTimeout((): void => {
      reject(new TimeoutError());
    }, duration);
  });
  return [timeout, pending];
}

function assertOptions(options: ConsumerOptions): void {
  requiredOptions.forEach((option) => {
    const possibilities = option.split('|');
    if (!possibilities.find((p) => options[p])) {
      throw new Error(
        `Missing ActiveMQ consumer option [ ${possibilities.join(' or ')} ].`,
      );
    }
  });
}

export class Consumer extends EventEmitter {
  private handleMessage: (message: IMessage) => Promise<void>;
  private handleMessageTimeout: number;
  private stopped: boolean;
  // private authenticationErrorTimeout: number;
  // private heartbeatInterval: number;
  private destination: string;
  private stompConfig: StompConfig;
  private client: Client;
  private recieveStompHeaders: StompHeaders;

  constructor(options: ConsumerOptions) {
    super();
    assertOptions(options);
    this.handleMessage = options.handleMessage;
    this.handleMessageTimeout = options.handleMessageTimeout;
    this.stopped = true;
    this.destination = options.destination;
    this.recieveStompHeaders = options.recieveStompHeaders || {
      ack: 'client-individual',
    };
    this.stompConfig = options.stompConfing;

    // this.heartbeatInterval = options.heartbeatInterval;
    // this.authenticationErrorTimeout =
    //   options.authenticationErrorTimeout || 10000;
    debug(options);
    const client = new Client(this.stompConfig);
    client.onConnect = function (frame) {
      debug('connected', frame);
      // Do something, all subscribes must be done is this callback
      // This is needed because this will be executed after a (re)connect
    };

    client.onDisconnect = function () {
      debug('See you next time!');
    };

    client.onStompError = function (frame) {
      // Will be invoked in case of error encountered at Broker
      // Bad login/passcode typically will cause an error
      // Complaint brokers will set `message` header with a brief message. Body may contain details.
      // Compliant brokers will terminate the connection after any error
      debug('Broker reported error: ' + frame.headers['message']);
      debug('Additional details: ' + frame.body);
    };

    // client.activate();
    this.client = client;
    autoBind(this);
  }

  emit<T extends keyof Events>(event: T, ...args: Events[T]) {
    return super.emit(event, ...args);
  }

  on<T extends keyof Events>(
    event: T,
    listener: (...args: Events[T]) => void,
  ): this {
    return super.on(event, listener);
  }

  once<T extends keyof Events>(
    event: T,
    listener: (...args: Events[T]) => void,
  ): this {
    return super.once(event, listener);
  }

  public get isRunning(): boolean {
    return !this.stopped;
  }

  public static create(options: ConsumerOptions): Consumer {
    return new Consumer(options);
  }

  async connect() {
    return new Promise(async (resolve) => {
      this.client.activate();
      if (this.client.connected) {
        return resolve(true);
      }
      this.client.onConnect = (i: IFrame) => {
        return resolve(i);
      };
    });
  }

  public start(): void {
    if (this.stopped) {
      debug('Starting consumer');
      this.stopped = false;
      const poll = this.poll;
      this.connect().then(() => {
        poll();
      });
    }
  }

  public stop(): void {
    debug('Stopping consumer');
    this.stopped = true;
  }

  private async handleMqResponse(message: IMessage): Promise<void> {
    debug('Received MQ response');
    debug(message);
    if (message) {
      try {
        debug(
          'info',
          'message.headers[message-id]',
          message.headers['message-id'],
        );
        await this.processMessage(message);
        message.ack(message.headers);
      } catch (error) {
        this.emitError(error, message);
        debug(error);
        debug('error', 'error processing', error);
        message.nack(message.headers);
      }
      this.emit('response_processed');
    } else {
      this.emit('empty');
    }
  }

  private async processMessage(message: IMessage): Promise<void> {
    this.emit('message_received', message);
    let heartbeat;
    try {
      await this.executeHandler(message);
      this.emit('message_processed', message);
    } catch (err) {
      this.emitError(err, message);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async executeHandler(message: IMessage): Promise<void> {
    let timeout;
    let pending;
    try {
      if (this.handleMessageTimeout) {
        [timeout, pending] = createTimeout(this.handleMessageTimeout);
        await Promise.race([this.handleMessage(message), pending]);
      } else {
        await this.handleMessage(message);
      }
    } catch (err) {
      if (err instanceof TimeoutError) {
        err.message = `Message handler timed out after ${this.handleMessageTimeout}ms: Operation timed out.`;
      } else if (err instanceof Error) {
        err.message = `Unexpected message handler failure: ${err.message}`;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private emitError(err: Error, message: IMessage): void {
    this.emit('error', err, message);
    // if (err.name === MQError.name) {
    //   this.emit('error', err, message);
    // } else if (err instanceof TimeoutError) {
    //   this.emit('timeout_error', err, message);
    // } else {
    //   this.emit('processing_error', err, message);
    // }
  }
  private poll(): void {
    if (this.stopped) {
      this.emit('stopped');
      return;
    }
    debug('Polling for messages');

    this.client.subscribe(
      this.destination,
      this.handleMqResponse,
      this.recieveStompHeaders,
    );
  }

  // private startHeartbeat(heartbeatFn: () => void): NodeJS.Timeout {
  //   return setInterval(() => {
  //     heartbeatFn();
  //   }, this.heartbeatInterval * 1000);
  // }
}
