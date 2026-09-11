export interface OpenCodeModel {
  providerID: string;
  modelID: string;
}

export function parseModelId(value?: string): OpenCodeModel | undefined {
  if (!value) {
    return undefined;
  }

  const separator = value.indexOf("/");
  if (separator === -1) {
    return undefined;
  }

  return {
    providerID: value.slice(0, separator),
    modelID: value.slice(separator + 1),
  };
}
