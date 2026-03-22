require('dotenv').config({ path: '.env.local' });

console.log("LINE Webhook Channel Secret:", process.env.LINE_CHANNEL_SECRET ? "***..."+process.env.LINE_CHANNEL_SECRET.slice(-4) : "Missing");
console.log("LINE Webhook Channel Access Token:", process.env.LINE_CHANNEL_ACCESS_TOKEN ? "***..."+process.env.LINE_CHANNEL_ACCESS_TOKEN.slice(-4) : "Missing");

console.log("LINE LIFF ID (Check-in):", process.env.NEXT_PUBLIC_LIFF_ID);

console.log("\nThe issue: Same LINE user, different channel = different UID");
console.log("This happens if the LIFF app (Login Channel) and the Messaging API (Bot Channel) are in DIFFERENT providers on LINE Developer Console.");
