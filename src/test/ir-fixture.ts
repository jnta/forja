import { loadLibrary } from "@/application/library/load";
import type { ForjaIr } from "@/domain/ir";
import { NodeFilesystem } from "@/infrastructure/cli/node-filesystem";
import { YamlParser } from "@/infrastructure/yaml/yaml-parser";

export async function loadIr(
  projectDir: string,
  globalDir: string,
): Promise<ForjaIr> {
  const result = await loadLibrary(
    { filesystem: new NodeFilesystem(), yaml: new YamlParser() },
    { projectDir, globalDir },
  );
  return result.ir;
}
