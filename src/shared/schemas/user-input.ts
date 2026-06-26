import { z } from "zod";

export const UserInputOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
});
export type UserInputOption = z.infer<typeof UserInputOptionSchema>;

export const UserInputQuestionSchema = z.object({
  id: z.string().min(1),
  header: z.string().min(1),
  question: z.string().min(1),
  required: z.boolean().optional(),
  isOther: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  multiSelect: z.boolean().optional(),
  options: z.array(UserInputOptionSchema).nullable().optional(),
});
export type UserInputQuestion = z.infer<typeof UserInputQuestionSchema>;

export const UserInputAnswerSchema = z.object({
  answers: z.array(z.string()),
});
export type UserInputAnswer = z.infer<typeof UserInputAnswerSchema>;

export const UserInputAnswersSchema = z.record(
  z.string().min(1),
  UserInputAnswerSchema
);
export type UserInputAnswers = z.infer<typeof UserInputAnswersSchema>;
