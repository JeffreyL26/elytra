import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { env } from "@/lib/env";
import { createId } from "@/lib/ids";

export interface SendMailInput {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  // Einzige Schaltstelle: stammt aus broker.is_dummy. true => kein SES-Call.
  dummy: boolean;
}

export interface SendMailResult {
  messageId: string;
}

// Genau zwei Pfade: dummy oder real. Kein Mischbetrieb, keine Override-Flags.
// Wer echte Mails will, setzt is_dummy = false auf dem Broker.
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (input.dummy) {
    const messageId = `dummy-${createId()}`;
    console.log(`[DUMMY] would send to ${input.to}: ${input.subject}`);
    return { messageId };
  }
  return sendViaSes(input);
}

async function sendViaSes(input: SendMailInput): Promise<SendMailResult> {
  // Credential-Check ausschliesslich im real-Pfad (Point-of-Use).
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error("SES credentials missing — set AWS_ACCESS_KEY_ID/SECRET in .env");
  }
  if (!AWS_REGION) {
    throw new Error("SES region missing — set AWS_REGION in .env");
  }

  const client = new SESClient({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  const command = new SendEmailCommand({
    Source: input.from,
    Destination: { ToAddresses: [input.to] },
    ReplyToAddresses: [input.replyTo],
    Message: {
      Subject: { Data: input.subject, Charset: "UTF-8" },
      Body: {
        Text: { Data: input.textBody, Charset: "UTF-8" },
        Html: { Data: input.htmlBody, Charset: "UTF-8" },
      },
    },
  });

  const response = await client.send(command);
  if (!response.MessageId) {
    throw new Error("SES did not return a MessageId");
  }
  return { messageId: response.MessageId };
}
