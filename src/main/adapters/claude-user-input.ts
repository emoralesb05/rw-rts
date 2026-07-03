import type { UserInputAnswers, UserInputQuestion } from "@shared/schemas";

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return trimmed ? [trimmed] : [];
    }
    const record = recordValue(candidate);
    if (!record) return [];
    const label =
      nonEmptyString(record.label) ??
      nonEmptyString(record.value) ??
      nonEmptyString(record.title) ??
      nonEmptyString(record.name);
    return label ? [label] : [];
  });
}

function optionList(value: unknown): UserInputQuestion["options"] {
  if (!Array.isArray(value)) return undefined;
  const options = value.flatMap((candidate) => {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      return trimmed ? [{ label: trimmed, value: trimmed }] : [];
    }
    const record = recordValue(candidate);
    if (!record) return [];
    const label =
      nonEmptyString(record.label) ??
      nonEmptyString(record.value) ??
      nonEmptyString(record.title) ??
      nonEmptyString(record.name);
    if (!label) return [];
    const value = nonEmptyString(record.value) ?? label;
    const description =
      nonEmptyString(record.description) ?? nonEmptyString(record.hint);
    return [
      {
        label,
        value,
        ...(description ? { description } : {}),
      },
    ];
  });
  return options.length > 0 ? options : undefined;
}

function claudeQuestionFromValue(
  value: unknown,
  index: number
): UserInputQuestion | null {
  const record = recordValue(value);
  const question =
    typeof value === "string"
      ? value.trim()
      : record
        ? (nonEmptyString(record.question) ??
          nonEmptyString(record.prompt) ??
          nonEmptyString(record.message) ??
          nonEmptyString(record.text))
        : undefined;
  if (!question) return null;

  const header =
    record &&
    (nonEmptyString(record.header) ??
      nonEmptyString(record.title) ??
      nonEmptyString(record.name));
  const options = record
    ? optionList(record.options ?? record.choices ?? record.suggestions)
    : undefined;
  const isSecret =
    record?.type === "password" ||
    record?.type === "secret" ||
    record?.isSecret === true;
  const multiSelect =
    record?.multiSelect === true ||
    record?.multi_select === true ||
    record?.allowMultiple === true ||
    record?.allow_multiple === true;

  return {
    id: `question-${index + 1}`,
    header: header ?? `Question ${index + 1}`,
    question,
    required: record?.required === false ? false : true,
    ...(isSecret ? { isSecret } : {}),
    ...(multiSelect ? { multiSelect } : {}),
    ...(options ? { options } : {}),
  };
}

export function claudeAskUserQuestions(
  toolInput: unknown
): UserInputQuestion[] {
  const input = recordValue(toolInput);
  if (!input) return [];
  const rawQuestions = Array.isArray(input.questions)
    ? input.questions
    : [
        input.question ??
          input.prompt ??
          input.message ??
          input.text ??
          undefined,
      ].filter((value) => value != null);
  return rawQuestions.flatMap((candidate, index) => {
    const question = claudeQuestionFromValue(candidate, index);
    return question ? [question] : [];
  });
}

export function claudeAskUserQuestionUpdatedInput(
  toolInput: unknown,
  answers: UserInputAnswers
): Record<string, unknown> | null {
  const input = recordValue(toolInput);
  if (!input) return null;
  const questions = claudeAskUserQuestions(toolInput);
  const answerMap: Record<string, string> = {};

  for (const question of questions) {
    const selected = stringList(answers[question.id]?.answers);
    if (selected.length === 0) continue;
    answerMap[question.question] = selected.join(", ");
  }

  if (Object.keys(answerMap).length === 0) return null;
  return {
    ...input,
    answers: answerMap,
  };
}
