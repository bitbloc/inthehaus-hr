// The LINE client every route uses. Same API as @line/bot-sdk's Client, but each
// reply / push / multicast / broadcast carries the shop logo in its Flex headers.
// If LINE rejects the decorated message (400), the original is sent unchanged,
// so the logo can never stop a message from arriving.
import { Client as LineClient } from '@line/bot-sdk';
import { withShopLogo } from './brand';

async function sendDecorated(send, messages) {
  let decorated = messages;
  try {
    decorated = withShopLogo(messages);
  } catch {
    decorated = messages;
  }
  if (JSON.stringify(decorated) === JSON.stringify(messages)) return send(messages);
  try {
    return await send(decorated);
  } catch (err) {
    const status = err?.statusCode ?? err?.status ?? err?.originalError?.response?.status;
    if (status !== 400) throw err;
    console.warn('[shop logo] LINE rejected decorated message, resending without logo');
    return send(messages);
  }
}

export class Client extends LineClient {
  replyMessage(replyToken, messages, ...rest) {
    return sendDecorated((m) => super.replyMessage(replyToken, m, ...rest), messages);
  }

  pushMessage(to, messages, ...rest) {
    return sendDecorated((m) => super.pushMessage(to, m, ...rest), messages);
  }

  multicast(to, messages, ...rest) {
    return sendDecorated((m) => super.multicast(to, m, ...rest), messages);
  }

  broadcast(messages, ...rest) {
    return sendDecorated((m) => super.broadcast(m, ...rest), messages);
  }
}
