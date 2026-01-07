import axios from "axios";

/**
 * Normalize Indian phone number
 */
const formatPhone = (phone) => {
  if (!phone) return null;
  return phone.startsWith("91") ? phone : `91${phone}`;
};

/**
 * Send WhatsApp order update
 */
export const sendOrderWhatsapp = async ({
  phone,
  templateId,
  variables,
  mediaUrl,
}) => {
  try {
    const formattedPhone = formatPhone(phone);
    if (!formattedPhone) return;

    let url =
      `https://www.fast2sms.com/dev/whatsapp?` +
      `authorization=${process.env.FAST_2_SMS_API_KEY}` +
      `&message_id=${templateId}` +
      `&phone_number_id=982032241651336` +
      `&numbers=${formattedPhone}` +
      `&variables_values=${variables.join("|")}`;

    if (mediaUrl) {
      url += `&media_url=${encodeURIComponent(mediaUrl)}`;
    }

    await axios.get(url, { timeout: 10000 });

    console.log("📲 WhatsApp sent to", formattedPhone);
  } catch (error) {
    console.error("❌ WhatsApp send failed:", error?.response?.data || error.message);
  }
};
