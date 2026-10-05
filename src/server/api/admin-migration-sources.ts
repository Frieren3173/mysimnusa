import { requireMigrationUser } from "@/lib/migration/auth";
import { ok, err } from "@/lib/api";
import { getConnectionPublic, fetchGoogle, isGoogleConfigured } from "@/lib/google/auth";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export async function GET() {
  const user = await requireMigrationUser();
  if (!user) return err("UNAUTHORIZED", "Akses Migration Center hanya untuk Super Admin", 401);

  const configured = isGoogleConfigured();
  const connection = await getConnectionPublic("SOURCE");
  if (connection.status !== "CONNECTED") {
    return ok({ configured, connection, sources: [] });
  }

  try {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,webViewLink)");
    const res = await fetchGoogle("SOURCE",       `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=50&orderBy=modifiedTime desc`
    );
    if (!res.ok) {
      return err("DRIVE_LIST_FAILED", `Gagal membaca daftar Sheet (HTTP ${res.status})`, 502);
    }
    const json = (await res.json()) as { files?: DriveFile[] };
    return ok({ configured, connection, sources: json.files ?? [] });
  } catch (e) {
    return err("DRIVE_LIST_FAILED", e instanceof Error ? e.message : "Gagal membaca Google Drive", 502);
  }
}
