import path from "node:path";
import { gunzipSync } from "node:zlib";
import AdmZip from "adm-zip";
import tar from "tar-stream";
import { sha256 } from "../../shared/kernel/ids.ts";
import type {
  IngestionArtifactInput,
  IngestionRelationshipInput,
} from "../../modules/data-plane/application/ingestion-service.ts";

const ignoredPathSegments = [
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".git/",
  "vendor/",
  "target/",
  "__pycache__/",
  ".next/",
];

const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".sql",
  ".yaml",
  ".yml",
  ".json",
  ".md",
  ".sh",
  ".env",
]);

export interface ParsedArchiveResult {
  inferredCommitSha: string;
  artifacts: IngestionArtifactInput[];
  relationships: IngestionRelationshipInput[];
  skippedPaths: string[];
}

export const parseArchiveUpload = async (input: {
  fileName: string;
  buffer: Buffer;
}): Promise<ParsedArchiveResult> => {
  const lowerName = input.fileName.toLowerCase();
  let files: Array<{ path: string; content: string }> = [];

  if (lowerName.endsWith(".zip")) {
    files = parseZip(input.buffer);
  } else if (
    lowerName.endsWith(".tar") ||
    lowerName.endsWith(".tgz") ||
    lowerName.endsWith(".tar.gz")
  ) {
    files = await parseTar(input.buffer, lowerName.endsWith(".tar") ? "tar" : "tgz");
  } else if (lowerName.endsWith(".json")) {
    files = parseJsonManifest(input.buffer);
  } else {
    throw new Error(
      "Unsupported upload type. Use .zip, .tar, .tgz, .tar.gz, or .json manifest.",
    );
  }

  const artifacts: IngestionArtifactInput[] = [];
  const relationships: IngestionRelationshipInput[] = [];
  const skippedPaths: string[] = [];

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!normalizedPath || shouldIgnore(normalizedPath)) {
      skippedPaths.push(normalizedPath || file.path);
      continue;
    }

    const extension = path.extname(normalizedPath).toLowerCase();
    if (!codeExtensions.has(extension) && !normalizedPath.endsWith("Dockerfile")) {
      skippedPaths.push(normalizedPath);
      continue;
    }

    if (file.content.length > 250_000 || looksBinary(file.content)) {
      skippedPaths.push(normalizedPath);
      continue;
    }

    artifacts.push({
      path: normalizedPath,
      kind: inferArtifactKind(normalizedPath),
      title: normalizedPath,
      summary: summarize(file.content),
      content: file.content,
      symbols: extractSymbols(file.content),
    });

    for (const relation of extractRelationships(normalizedPath, file.content)) {
      relationships.push(relation);
    }
  }

  return {
    inferredCommitSha: sha256(input.buffer.toString("base64")).slice(0, 12),
    artifacts,
    relationships,
    skippedPaths,
  };
};

const parseZip = (buffer: Buffer): Array<{ path: string; content: string }> => {
  const zip = new AdmZip(buffer);
  return zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      path: entry.entryName,
      content: entry.getData().toString("utf8"),
    }));
};

const parseTar = async (
  buffer: Buffer,
  mode: "tar" | "tgz",
): Promise<Array<{ path: string; content: string }>> => {
  const extract = tar.extract();
  const files: Array<{ path: string; content: string }> = [];
  const source = mode === "tgz" ? gunzipSync(buffer) : buffer;

  await new Promise<void>((resolve, reject) => {
    extract.on("entry", (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("end", () => {
        if (header.type === "file") {
          files.push({
            path: header.name,
            content: Buffer.concat(chunks).toString("utf8"),
          });
        }
        next();
      });
      stream.on("error", reject);
      stream.resume();
    });
    extract.on("finish", () => resolve());
    extract.on("error", reject);
    extract.end(source);
  });

  return files;
};

const parseJsonManifest = (buffer: Buffer): Array<{ path: string; content: string }> => {
  const parsed = JSON.parse(buffer.toString("utf8")) as {
    files?: Array<{ path: string; content: string }>;
    artifacts?: Array<{ path: string; content: string }>;
  };

  return parsed.files ?? parsed.artifacts ?? [];
};

const inferArtifactKind = (
  filePath: string,
): IngestionArtifactInput["kind"] => {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.includes("readme") || lowerPath.endsWith(".md")) {
    return "doc";
  }
  if (lowerPath.includes("schema") || lowerPath.endsWith(".sql")) {
    return "schema";
  }
  if (lowerPath.includes("architecture") || lowerPath.includes("adr")) {
    return "architecture";
  }
  if (lowerPath.includes("runbook")) {
    return "runbook";
  }

  return "code";
};

const summarize = (content: string): string =>
  content.replace(/\s+/g, " ").trim().slice(0, 200);

const normalizePath = (value: string): string =>
  value.replace(/\\/g, "/").replace(/^\.?\//, "");

const shouldIgnore = (filePath: string): boolean =>
  ignoredPathSegments.some((segment) => filePath.includes(segment));

const looksBinary = (content: string): boolean => /\u0000/.test(content);

const extractSymbols = (content: string): string[] => {
  const matches = new Set<string>();
  const patterns = [
    /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\binterface\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\btype\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        matches.add(match[1]);
      }
    }
  }

  return [...matches].slice(0, 25);
};

const extractRelationships = (
  filePath: string,
  content: string,
): IngestionRelationshipInput[] => {
  const relations: IngestionRelationshipInput[] = [];
  const patterns = [
    /\bimport\s+.+?\s+from\s+["']([^"']+)["']/g,
    /\brequire\(["']([^"']+)["']\)/g,
    /\bfrom\s+["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const target = match[1];
      if (!target) {
        continue;
      }

      relations.push({
        from: filePath,
        to: target,
        relation: "imports",
        confidence: "syntax_inferred",
        evidenceRefs: [filePath],
      });
    }
  }

  return relations;
};
