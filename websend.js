const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
});

// Your numbers (India = 91)
const numbers = ["918767884273"];

// ✍️ ENTER YOUR MESSAGE HERE (bold + emojis supported)
const message = `
Hello 
आम्ही Developer Verse - Gym Owners साठी Professional Website तयार करतो,
जे तुम्हाला more members + more enquiries + strong online presence मिळवून देईल 

🌐 Website फायदे:
✔ Google search मध्ये top visibility
✔ Direct WhatsApp / Call
✔ Online membership / enquiry form
✔ Premium & trusted gym image

🖥 Gym Website Demo:
 https://gymdemo.developerverse.tech

🌐 Developer Verse – Our Website:
 https://developerverse.tech/

📅 Free 15-min meeting book करा :
 Call Now 8793234273

📲 Call / WhatsApp: 8793234273

Interested? Reply YES
`;

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("Scan the QR code with WhatsApp");
});

client.on("ready", async () => {
  console.log("WhatsApp is ready ✅");

  for (let number of numbers) {
    try {
      // Ensure the number is registered on WhatsApp
      const contact = await client.getNumberId(number);
      console.log(`getNumberId(${number}) ->`, contact);
      if (!contact) {
        console.log(`Number not registered on WhatsApp: ${number}`);
        continue;
      }

      const chatId = contact._serialized || `${number}@c.us`;

      // Diagnostic attempts: fetch contact and chat, log results
      let fetchedContact = null;
      let chat = null;
      try {
        if (typeof client.getContactById === "function") {
          fetchedContact = await client
            .getContactById(chatId)
            .catch(() => null);
        }
      } catch (cErr) {
        console.error(
          `getContactById error for ${number}:`,
          cErr && cErr.stack ? cErr.stack : cErr,
        );
      }

      try {
        if (typeof client.getChatById === "function") {
          chat = await client.getChatById(chatId).catch(() => null);
        }
      } catch (chErr) {
        console.error(
          `getChatById error for ${number}:`,
          chErr && chErr.stack ? chErr.stack : chErr,
        );
      }

      console.log(
        `fetchedContact for ${number}:`,
        fetchedContact ? "OK" : "null",
      );
      console.log(`chat for ${number}:`, chat ? "OK" : "null");

      // Try sending via chat.sendMessage first (if chat available)
      try {
        if (chat && typeof chat.sendMessage === "function") {
          await chat.sendMessage(message);
          console.log(`Message sent to ${number} via chat.sendMessage()`);
        } else {
          // Fallback to client.sendMessage
          await client.sendMessage(chatId, message);
          console.log(`Message sent to ${number} via client.sendMessage()`);
        }
      } catch (sendErr) {
        // Log full stack for diagnosis
        console.error(
          `Failed to send to ${number} — first attempt:`,
          sendErr && sendErr.stack ? sendErr.stack : sendErr,
        );

        // Try one more time with client.sendMessage as a last resort
        try {
          await client.sendMessage(chatId, message);
          console.log(
            `Message sent to ${number} via client.sendMessage() (retry)`,
          );
        } catch (retryErr) {
          console.error(
            `Failed to send to ${number} on retry:`,
            retryErr && retryErr.stack ? retryErr.stack : retryErr,
          );
        }
      }

      // Throttle small delay between sends to reduce race conditions
      await new Promise((r) => setTimeout(r, 800));
    } catch (err) {
      console.error(
        `Unexpected error while processing ${number}:`,
        err && err.stack ? err.stack : err,
      );
    }
  }

  console.log("All messages sent 🎉");
});

client.initialize();
