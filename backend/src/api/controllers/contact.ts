/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Resend } from "resend";
import MonkeyError from "../../utils/error";
import { MonkeyResponse } from "../../utils/monkey-response";
import { ContactRequest } from "@monkeytype/contracts/contact";
import { MonkeyRequest } from "../types";
import Logger from "../../utils/logger";

let resendClient: Resend | undefined = undefined;

function getResendClient(): Resend {
  if (resendClient === undefined) {
    const apiKey = process.env["RESEND_API_KEY"];
    if (!apiKey) {
      throw new MonkeyError(
        500,
        "Resend API key is not configured. Please set RESEND_API_KEY in environment variables.",
      );
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function sendContactMessage(
  req: MonkeyRequest<undefined, ContactRequest>,
): Promise<MonkeyResponse<{ success: boolean }>> {
  const { name, email, contactType, message } = req.body;

  const receiverEmail = process.env["CONTACT_RECEIVER_EMAIL"];
  const fromEmail = process.env["RESEND_FROM_EMAIL"];

  if (!receiverEmail) {
    throw new MonkeyError(
      500,
      "Contact receiver email is not configured. Please set CONTACT_RECEIVER_EMAIL in environment variables.",
    );
  }

  if (!fromEmail) {
    throw new MonkeyError(
      500,
      "Resend from email is not configured. Please set RESEND_FROM_EMAIL in environment variables.",
    );
  }

  try {
    const client = getResendClient();

    const emailSubject = `Contact Form: ${contactType} from ${name}`;
    const emailBody = `
      <h2>Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Contact Type:</strong> ${contactType}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
    `;

    const result = await client.emails.send({
      from: fromEmail,
      to: receiverEmail,
      replyTo: email,
      subject: emailSubject,
      html: emailBody,
    });

    if (result.error) {
      // Logger.error(
      //   `Resend API error: ${JSON.stringify(result.error)}`,
      // );
      throw new MonkeyError(
        500,
        "Failed to send contact message. Please try again later.",
        JSON.stringify(result.error),
      );
    }

    Logger.info(`Contact form submitted successfully from ${email}`);

    return new MonkeyResponse("Message sent successfully", { success: true });
  } catch (error) {
    if (error instanceof MonkeyError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    // Logger.error(`Error sending contact message: ${errorMessage}`);
    throw new MonkeyError(
      500,
      "An error occurred while sending your message. Please try again later.",
      errorMessage,
    );
  }
}
