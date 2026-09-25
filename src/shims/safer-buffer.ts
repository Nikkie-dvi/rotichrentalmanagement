// Worker-safe replacement for the `safer-buffer` npm package.
//
// The original package does `var buffer = require('buffer')` and then calls
// `buffer.hasOwnProperty(key)` while copying exports. In the Cloudflare
// Worker bundle, `require('buffer')` becomes an ES module namespace object,
// which has no prototype — so `buffer.hasOwnProperty is not a function`
// crashes every push notification (web-push → asn1.js → safer-buffer).
//
// The real Buffer from node:buffer is already safe in this runtime, so we
// just re-export it in the shape safer-buffer's consumers expect.
import { Buffer } from "node:buffer";

const SlowBuffer = Buffer as unknown as typeof Buffer;

export { Buffer, SlowBuffer };
export default { Buffer, SlowBuffer };
