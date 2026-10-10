import { Behavior, Type, type Tool } from "@google/genai";

export const voiceTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "record_answers",
        description:
          "Save only the quote details the buyer explicitly stated in this turn.",
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
