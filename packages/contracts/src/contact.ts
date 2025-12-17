import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { CommonResponses, meta, responseWithData } from "./util/api";

export const ContactRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    contactType: z.enum([
      "Question",
      "Feedback",
      "Bug Report",
      "Suggestion",
      "Other",
    ]),
    message: z.string().min(10).max(2000),
  })
  .strict();

export type ContactRequest = z.infer<typeof ContactRequestSchema>;

export const ContactResponseSchema = responseWithData(
  z.object({
    success: z.boolean(),
  }),
);

export type ContactResponse = z.infer<typeof ContactResponseSchema>;

const c = initContract();
export const contactContract = c.router(
  {
    send: {
      summary: "send contact form",
      description: "Send a contact form message via email",
      method: "POST",
      path: "",
      body: ContactRequestSchema,
      responses: {
        200: ContactResponseSchema,
      },
      metadata: meta({
        authenticationOptions: {
          isPublic: true,
        },
        rateLimit: "contactSend",
        openApiTags: "contact",
      }),
    },
  },
  {
    pathPrefix: "/contact",
    strictStatusCodes: true,
    metadata: meta({
      openApiTags: "contact",
    }),
    commonResponses: CommonResponses,
  },
);
