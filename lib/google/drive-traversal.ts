import type { drive_v3 } from "googleapis";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  /** Chain of subfolder names from the owning unit folder down to this file - empty when the file sits directly in the unit folder. Informational only; the file's owning unit/driveFolderId is always the top-level folder, never one of these. */
  folderPath: string[];
};

export type DriveImportUnit = {
  folderId: string;
  folderName: string;
  files: DriveEntry[];
};

export type DriveImportTree = {
  units: DriveImportUnit[];
  /** True when the root had no subfolders - `units` is then a single synthetic entry holding every loose file, still needing to be split into real units by classification. */
  isFlat: boolean;
};

async function listAllChildren(
  drive: drive_v3.Drive,
  folderId: string,
  resourceKeyHeader?: string
): Promise<DriveEntry[]> {
  const entries: DriveEntry[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await drive.files.list(
      {
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
        orderBy: "name_natural",
        pageSize: 200,
        pageToken,
        spaces: "drive",
        // files.list excludes Shared Drive content by default - without these,
        // a folder that lives in an org Shared Drive (common for course
        // material) silently comes back with zero children, no error.
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      },
      resourceKeyHeader ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } } : undefined
    );

    for (const file of data.files ?? []) {
      if (!file.id || !file.name || !file.mimeType) continue;
      entries.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink ?? null,
        folderPath: [],
      });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return entries;
}

const MAX_RECURSION_DEPTH = 6;

/**
 * Lists every file under a folder at any depth, not just its direct
 * children - a unit folder's own subfolders (e.g. "Lectures/Week 3/") are
 * real content, not noise to discard. Each returned file's folderPath is the
 * chain of subfolder names from the starting folder down to where the file
 * actually lives. Capped at MAX_RECURSION_DEPTH as a defensive guard against
 * pathological/cyclical structures - returns whatever was found so far past
 * the cap rather than erroring or recursing forever.
 */
async function listAllFilesRecursive(
  drive: drive_v3.Drive,
  folderId: string,
  resourceKeyHeader: string | undefined,
  folderPath: string[],
  depth = 1
): Promise<DriveEntry[]> {
  const children = await listAllChildren(drive, folderId, resourceKeyHeader);
  const files = children
    .filter((c) => c.mimeType !== FOLDER_MIME_TYPE)
    .map((f) => ({ ...f, folderPath }));

  if (depth >= MAX_RECURSION_DEPTH) return files;

  const subfolders = children.filter((c) => c.mimeType === FOLDER_MIME_TYPE);
  const nested = await Promise.all(
    subfolders.map((folder) =>
      listAllFilesRecursive(drive, folder.id, resourceKeyHeader, [...folderPath, folder.name], depth + 1)
    )
  );

  return [...files, ...nested.flat()];
}

/**
 * Root -> unit folders -> files, strictly 2 levels deep, when the root has
 * subfolders. If the root has no subfolders at all (a flat dump of files),
 * the whole root folder is treated as a single unit and its loose files
 * become that unit's lessons - there's nothing else to map them to.
 *
 * rootResourceKey comes from a "resourcekey=" query param on old-style share
 * links (identifiable by the legacy "0B..."-style folder id). Without it,
 * some Drive requests for that item can fail or come back empty depending on
 * how it's shared - it only ever applies to the root, since nested items
 * aren't independently shared, but every call in this tree passes it along
 * regardless (harmless if unneeded).
 */
export async function buildDriveImportTree(
  drive: drive_v3.Drive,
  rootFolderId: string,
  rootResourceKey?: string
): Promise<DriveImportTree> {
  const resourceKeyHeader = rootResourceKey ? `${rootFolderId}/${rootResourceKey}` : undefined;
  const requestOptions = resourceKeyHeader
    ? { headers: { "X-Goog-Drive-Resource-Keys": resourceKeyHeader } }
    : undefined;

  const rootChildren = await listAllChildren(drive, rootFolderId, resourceKeyHeader);
  const subfolders = rootChildren.filter((c) => c.mimeType === FOLDER_MIME_TYPE);
  console.log(
    `buildDriveImportTree: root ${rootFolderId} has ${rootChildren.length} direct child(ren): ${rootChildren.map((c) => `${c.name} (${c.mimeType})`).join(", ") || "none"}`
  );

  if (subfolders.length === 0) {
    const looseFiles = rootChildren.filter((c) => c.mimeType !== FOLDER_MIME_TYPE);
    if (looseFiles.length === 0) return { units: [], isFlat: true };

    const { data: rootFolder } = await drive.files.get(
      { fileId: rootFolderId, fields: "name", supportsAllDrives: true },
      requestOptions
    );
    return {
      units: [{ folderId: rootFolderId, folderName: rootFolder.name ?? "Imported unit", files: looseFiles }],
      isFlat: true,
    };
  }

  const units: DriveImportUnit[] = [];
  for (const folder of subfolders) {
    const files = await listAllFilesRecursive(drive, folder.id, resourceKeyHeader, []);
    const depths = new Set(files.map((f) => f.folderPath.length));
    console.log(
      `buildDriveImportTree: unit "${folder.name}" found ${files.length} file(s) across ${depths.size} subfolder level(s) (depths seen: ${[...depths].sort().join(", ") || "none"})`
    );
    units.push({ folderId: folder.id, folderName: folder.name, files });
  }
  return { units, isFlat: false };
}
