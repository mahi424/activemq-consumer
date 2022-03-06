# ActiveMQ Consumer

```js
// test.js
const { Consumer } = require('activemq-consumer');
// const constants = require('./secrets');

const constants = {
  username: 'username',
  password: 'password',
  brokerUrl: {
    wss: 'wss://mq-url:port',
  },
  queue: 'mq_test',
};

const app = new Consumer({
  stompConfing: {
    brokerURL: constants.brokerUrl.wss,
    connectHeaders: {
      login: constants.username,
      passcode: constants.password,
    },
    debug: function (str) {
      console.log(str);
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 4000,
    heartbeatOutgoing: 4000,
  },
  destination: 'mq_test',
  // handleMessage is async function
  handleMessage: (message) => {
    console.log(message.body);
  },
});

app.start();
```
