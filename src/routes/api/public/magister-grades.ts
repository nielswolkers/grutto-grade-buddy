import { createFileRoute } from "@tanstack/react-router";

type AnyRecord = Record<string, any>;

export const Route = createFileRoute("/api/public/magister-grades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            magisterBaseUrl?: unknown;
            accessToken?: unknown;
          };
          const magisterBaseUrl = normalizeMagisterBaseUrl(body.magisterBaseUrl);
          const accessToken = normalizeAccessToken(body.accessToken);
          const result = await fetchGradesFromMagister(magisterBaseUrl, accessToken);
          return json(result);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Onbekende fout." },
            400,
          );
        }
      },
      OPTIONS: async () =>
        new Response("ok", {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
          },
        }),
    },
  },
});

async function fetchGradesFromMagister(magisterBaseUrl: string, accessToken: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  const account = await magisterJson<AnyRecord>(magisterBaseUrl, "/api/account", headers);
  const personId = account?.Persoon?.Id ?? account?.persoon?.id;
  if (!personId) throw new Error("Geen Magister leerling gevonden.");

  const enrollmentData = await magisterJson<AnyRecord>(
    magisterBaseUrl,
    `/api/leerlingen/${personId}/aanmeldingen`,
    headers,
  );
  const enrollments = getItems(enrollmentData);
  const activeEnrollment =
    enrollments.find((item) => item?.IsHuidig || item?.isHuidig) ??
    enrollments[enrollments.length - 1];
  const enrollmentId = activeEnrollment?.Id ?? activeEnrollment?.id;
  if (!enrollmentId) throw new Error("Geen actieve Magister aanmelding gevonden.");

  const courseMap = await fetchCourseMap(magisterBaseUrl, accessToken, enrollmentId);
  const gradeData = await magisterJson<AnyRecord>(
    magisterBaseUrl,
    `/api/aanmeldingen/${enrollmentId}/cijfers?top=1000&skip=0`,
    headers,
  );

  const grades = getItems(gradeData).map((item) => normalizeGrade(item, courseMap));

  return {
    grades,
    meta: {
      fetchedAt: new Date().toISOString(),
      personId,
      enrollmentId,
      gradeCount: grades.length,
    },
  };
}

async function fetchCourseMap(
  baseUrl: string,
  accessToken: string,
  enrollmentId: string | number,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const courseMap: Record<string, string> = {};

  try {
    const data = await magisterJson<AnyRecord>(
      baseUrl,
      `/api/aanmeldingen/${enrollmentId}/studievakken`,
      headers,
    );
    for (const course of getItems(data)) {
      const id = course?.Id ?? course?.id;
      const name =
        course?.Omschrijving ??
        course?.omschrijving ??
        course?.Naam ??
        course?.naam ??
        (id ? `Vak ${id}` : "");
      if (id != null && name) courseMap[String(id)] = String(name);
    }
  } catch {
    /* continue with subject IDs */
  }

  return courseMap;
}

function normalizeGrade(item: AnyRecord, courseMap: Record<string, string>) {
  const column = item?.Kolom ?? item?.kolom ?? {};
  const period = column?.Periode ?? column?.periode ?? {};
  const courseId = column?.StudievakId ?? column?.studievakId;
  const rawGrade =
    item?.Waarde ??
    item?.waarde ??
    (item?.cijferGetal != null ? String(item.cijferGetal).replace(".", ",") : "");
  const date = item?.IngevoerdOp ?? item?.ingevoerdOp ?? "";

  return {
    course: courseMap[String(courseId)] ?? `Vak ${courseId ?? ""}`.trim(),
    description:
      column?.Omschrijving ?? column?.omschrijving ?? column?.Naam ?? column?.naam ?? "",
    grade: String(rawGrade || "?"),
    numericGrade: parseGrade(rawGrade),
    weight: column?.Weegfactor ?? column?.weegfactor ?? "",
    date,
    displayDate: formatDateNl(date),
    period: String(period?.Code ?? period?.code ?? ""),
    isSufficient: Boolean(item?.IsVoldoende ?? item?.isVoldoende ?? false),
    counts: (item?.TeltMee ?? item?.teltMee) !== false,
    columnType: String(column?.Type ?? column?.type ?? ""),
  };
}

async function magisterJson<T>(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), { headers });
  if (!response.ok) {
    throw new Error(`Magister aanvraag mislukt: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function normalizeMagisterBaseUrl(input: unknown) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error("Magister URL is verplicht.");
  }
  const url = new URL(input.trim());
  if (url.protocol !== "https:") throw new Error("Magister URL moet HTTPS gebruiken.");
  if (url.hostname !== "magister.net" && !url.hostname.endsWith(".magister.net")) {
    throw new Error("Gebruik een geldige magister.net URL.");
  }
  return `${url.protocol}//${url.hostname}`;
}

function normalizeAccessToken(input: unknown) {
  if (typeof input !== "string" || input.trim().length < 20) {
    throw new Error("Tijdelijke Magister token ontbreekt.");
  }
  return input.trim().replace(/^Bearer\s+/i, "");
}

function getItems(data: AnyRecord | undefined | null): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Items)) return data.Items;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function parseGrade(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateNl(iso: string) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
