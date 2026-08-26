import type { drive_v3 } from "googleapis";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type DriveEntry = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
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
      });
    }
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);

  return entries;
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
      { fileId: rootFolderId, fields: "name" },
      requestOptions
    );
    return {
      units: [{ folderId: rootFolderId, folderName: rootFolder.name ?? "Imported unit", files: looseFiles }],
      isFlat: true,
    };
  }

  const units: DriveImportUnit[] = [];
  for (const folder of subfolders) {
    const children = await listAllChildren(drive, folder.id, resourceKeyHeader);
    const files = children.filter((c) => c.mimeType !== FOLDER_MIME_TYPE);
    units.push({ folderId: folder.id, folderName: folder.name, files });
  }
  return { units, isFlat: false };
}
