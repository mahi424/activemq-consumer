import { StompConfig, StompHeaders, IMessage } from '@stomp/stompjs';

export interface TimeoutResponse {
  timeout: NodeJS.Timeout;
  pending: Promise<void>;
}

export interface ConsumerOptions {
  destination: string;
  stopped?: boolean;
  // authenticationErrorTimeout?: number;
  // heartbeatInterval?: number;
  handleMessageTimeout?: number;
  recieveStompHeaders: StompHeaders;
  stompConfing: StompConfig;
  handleMessage?(message: IMessage): Promise<void>;
}

export interface Events {
  response_processed: [];
  empty: [];
  message_received: [IMessage];
  message_processed: [IMessage];
  error: [Error, void | IMessage | IMessage[]];
  timeout_error: [Error, IMessage];
  processing_error: [Error, IMessage];
  stopped: [];
}
