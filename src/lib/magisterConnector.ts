import type { MagisterGrade } from "@/lib/magisterGrades";

export type MagisterConnectorMessage = {
  source: "magister-connector";
  grades?: MagisterGrade[];
  error?: string;
};

export function listenForMagisterConnector(
  onGrades: (grades: MagisterGrade[]) => void,
  onError?: (message: string) => void,
) {
  function handleMessage(event: MessageEvent<MagisterConnectorMessage>) {
    if (!isTrustedMagisterOrigin(event.origin)) return;
    if (event.data?.source !== "magister-connector") return;

    if (event.data.error) {
      onError?.(event.data.error);
      return;
    }

    if (Array.isArray(event.data.grades)) {
      onGrades(event.data.grades);
    }
  }

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

export function parseMagisterConnectorJson(value: string): MagisterGrade[] {
  const parsed = JSON.parse(value);
  const grades = Array.isArray(parsed) ? parsed : parsed?.grades;
  if (!Array.isArray(grades)) {
    throw new Error("De geplakte tekst bevat geen Magister cijfers.");
  }
  return grades as MagisterGrade[];
}

export function createMagisterConnectorBookmarklet(
  appOrigin: string = typeof window !== "undefined" ? window.location.origin : "",
) {
  const script = `(${magisterConnectorSource.toString()})(${JSON.stringify(appOrigin)})`;
  return `javascript:${encodeURIComponent(script)}`;
}

function isTrustedMagisterOrigin(originValue: string) {
  try {
    const origin = new URL(originValue);
    return (
      origin.protocol === "https:" &&
      (origin.hostname === "magister.net" || origin.hostname.endsWith(".magister.net"))
    );
  } catch {
    return false;
  }
}

function magisterConnectorSource(appOrigin: string) {
  (async function () {
    function post(payload: Record<string, unknown>) {
      if (window.opener) {
        window.opener.postMessage({ source: "magister-connector", ...payload }, appOrigin);
      } else {
        navigator.clipboard?.writeText(JSON.stringify((payload as any).grades || payload, null, 2));
        alert("Cijfers gekopieerd. Ga terug naar de app om ze te plakken.");
      }
    }

    function getToken() {
      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key || !key.startsWith("oidc.user:")) continue;
        try {
          const value = JSON.parse(sessionStorage.getItem(key) || "{}");
          if (value?.access_token) return value.access_token;
        } catch {
          /* ignore */
        }
      }
      return null;
    }

    async function magisterJson(path: string, headers: HeadersInit) {
      const response = await fetch(path, { credentials: "include", headers });
      if (!response.ok) throw new Error("Magister aanvraag mislukt: HTTP " + response.status);
      return response.json();
    }

    function getItems(data: any) {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.Items)) return data.Items;
      if (Array.isArray(data?.items)) return data.items;
      return [];
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

    function parseGrade(value: unknown) {
      const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    }

    try {
      if (!location.hostname.endsWith(".magister.net") && location.hostname !== "magister.net") {
        throw new Error("Open deze import vanuit een ingelogde Magister-pagina.");
      }

      const token = getToken();
      if (!token) throw new Error("Geen Magister sessie gevonden. Log eerst in via Magister of Microsoft.");

      const headers = {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      };

      const account = await magisterJson("/api/account", headers);
      const personId = account?.Persoon?.Id ?? account?.persoon?.id;
      const enrollmentData = await magisterJson("/api/leerlingen/" + personId + "/aanmeldingen", headers);
      const enrollments = getItems(enrollmentData);
      const activeEnrollment =
        enrollments.find((item: any) => item?.IsHuidig || item?.isHuidig) ??
        enrollments[enrollments.length - 1];
      const enrollmentId = activeEnrollment?.Id ?? activeEnrollment?.id;

      const courseMap: Record<string, string> = {};
      try {
        const courseData = await magisterJson("/api/aanmeldingen/" + enrollmentId + "/studievakken", headers);
        for (const course of getItems(courseData)) {
          const id = course?.Id ?? course?.id;
          const name =
            course?.Omschrijving ??
            course?.omschrijving ??
            course?.Naam ??
            course?.naam ??
            (id ? "Vak " + id : "");
          if (id != null && name) courseMap[String(id)] = String(name);
        }
      } catch {
        /* continue with IDs */
      }

      const gradeData = await magisterJson(
        "/api/aanmeldingen/" + enrollmentId + "/cijfers?top=1000&skip=0",
        headers,
      );

      const grades = getItems(gradeData).map((item: any) => {
        const column = item?.Kolom ?? item?.kolom ?? {};
        const period = column?.Periode ?? column?.periode ?? {};
        const courseId = column?.StudievakId ?? column?.studievakId;
        const rawGrade =
          item?.Waarde ??
          item?.waarde ??
          (item?.cijferGetal != null ? String(item.cijferGetal).replace(".", ",") : "");
        const date = item?.IngevoerdOp ?? item?.ingevoerdOp ?? "";

        return {
          course: courseMap[String(courseId)] ?? ("Vak " + (courseId ?? "")).trim(),
          description: column?.Omschrijving ?? column?.omschrijving ?? column?.Naam ?? column?.naam ?? "",
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
      });

      post({ grades });
    } catch (error) {
      post({ error: error instanceof Error ? error.message : "Importeren mislukt." });
    }
  })();
}
