import { Behavior, Type, type Tool } from "@google/genai";

export const voiceTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "note_price_request",
        description: "Record a buyer's request for a lower price or budget for vendor review. Never accept or promise a discount.",
        behavior: Behavior.BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            heard: { type: Type.STRING, description: "The buyer's exact price request." },
            requestedAmountCents: { type: Type.INTEGER, minimum: 1, description: "Explicit USD target in cents, only when the amount and basis are clear." },
            basis: { type: Type.STRING, enum: ["total", "per_part"], description: "Whether the target is for the whole order or each part." },
          },
          required: ["heard"],
        },
      },
      {
        name: "record_answers",
        description:
          "Save only quote details explicitly selected by the buyer or clearly confirmed from their own earlier statements. Never select engineering specifications, infer choices from a project description, or save agent recommendations or defaults.",
        behavior: Behavior.BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            materialGrade: {
              type: Type.STRING,
              enum: ["AL6061", "AL7075", "SS304"],
            },
            quantity: { type: Type.INTEGER, minimum: 1, maximum: 5000 },
            finish: {
              type: Type.STRING,
              enum: ["AS_MACHINED", "ANODIZE_CLEAR", "ANODIZE_BLACK"],
            },
          },
        },
      },
      {
        name: "note_unsupported",
        description:
          "Log an answer outside the allowed values. Never replace it with the nearest value.",
        behavior: Behavior.BLOCKING,
        parameters: {
          type: Type.OBJECT,
          properties: {
            field: {
              type: Type.STRING,
              enum: ["materialGrade", "quantity", "finish"],
            },
            heard: { type: Type.STRING },
          },
          required: ["field", "heard"],
        },
      },
    ],
  },
];
