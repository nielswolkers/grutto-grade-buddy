import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, ExternalLink, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  buildCourseGroups,
  fetchMagisterGrades,
  type MagisterGrade,
} from "@/lib/magisterGrades";
import {
  createMagisterConnectorBookmarklet,
  listenForMagisterConnector,
  parseMagisterConnectorJson,
} from "@/lib/magisterConnector";

export function MagisterGradeDashboard() {
  const [magisterBaseUrl, setMagisterBaseUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [grades, setGrades] = useState<MagisterGrade[]>([]);
  const [status, setStatus] = useState(
    "Vul je Magister URL in en open Magister om in te loggen.",
  );
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bookmarklet, setBookmarklet] = useState("");
  const [pastedJson, setPastedJson] = useState("");

  const courseGroups = useMemo(() => buildCourseGroups(grades), [grades]);

  useEffect(() => {
    setBookmarklet(createMagisterConnectorBookmarklet());
  }, []);

  useEffect(() => {
    return listenForMagisterConnector(
      (incomingGrades) => {
        setGrades(incomingGrades);
        setError("");
        setStatus(`${incomingGrades.length} cijfers geïmporteerd vanuit Magister.`);
      },
      (message) => {
        setError(message);
        setStatus("");
      },
    );
  }, []);

  async function copyBookmarklet() {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setError("");
      setStatus(
        "Importlink gekopieerd. Maak een nieuwe bladwijzer in je browser, plak de link als adres en klik erop op je ingelogde Magister-pagina.",
      );
    } catch {
      setError("Kopiëren mislukt. Selecteer en kopieer de link handmatig.");
    }
  }

  function loadPastedJson() {
    try {
      const incoming = parseMagisterConnectorJson(pastedJson);
      setGrades(incoming);
      setPastedJson("");
      setError("");
      setStatus(`${incoming.length} cijfers geladen vanuit geplakte data.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Geplakte data is ongeldig.");
    }
  }


  function openMagister() {
    try {
      const url = normalizeMagisterUrl(magisterBaseUrl);
      window.open(url, "_blank", "noopener,noreferrer");
      setStatus(
        "Log in via Magister of Microsoft. Gebruik daarna de importlink op de Magister-pagina.",
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Controleer je Magister URL.");
    }
  }

  async function importWithToken() {
    setIsLoading(true);
    setError("");
    setStatus("Cijfers ophalen…");
    try {
      const result = await fetchMagisterGrades({ magisterBaseUrl, accessToken });
      setGrades(result.grades);
      setStatus(`${result.meta.gradeCount} cijfers opgehaald.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Importeren mislukt.");
      setStatus("");
    } finally {
      setAccessToken("");
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Grutto Grades</h1>
              <p className="text-sm text-muted-foreground">Magister cijfers per vak</p>
            </div>
          </div>
          <Button onClick={openMagister} className="gap-2" disabled={!magisterBaseUrl}>
            <ExternalLink className="h-4 w-4" />
            Open Magister
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-md border bg-card p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="magister-url">Magister URL</Label>
                <Input
                  id="magister-url"
                  placeholder="https://jouwschool.magister.net"
                  value={magisterBaseUrl}
                  onChange={(event) => setMagisterBaseUrl(event.target.value)}
                  autoComplete="off"
                />
              </div>

              <Button
                onClick={openMagister}
                className="w-full gap-2"
                disabled={!magisterBaseUrl}
              >
                <ExternalLink className="h-4 w-4" />
                Open Magister
              </Button>

              <a
                href={connectorHref}
                draggable
                className="flex min-h-10 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                onClick={(e) => {
                  if (connectorHref === "#") e.preventDefault();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Importlink voor Magister
              </a>

              <p className="text-xs text-muted-foreground">
                Sleep de importlink naar je bladwijzerbalk of bookmark de link. Open
                Magister, log in (ook via Microsoft als dat verschijnt) en klik dan op
                de bladwijzer om je cijfers naar deze app te sturen.
              </p>
            </div>
          </section>

          <section className="rounded-md border bg-card p-4">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left font-medium"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Geavanceerde token import
              </span>
              <span aria-hidden>{showAdvanced ? "−" : "+"}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="magister-token">Tijdelijke Magister token</Label>
                  <Input
                    id="magister-token"
                    type="password"
                    value={accessToken}
                    onChange={(event) => setAccessToken(event.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    De token wordt eenmalig gebruikt en daarna direct gewist. Niets
                    wordt opgeslagen.
                  </p>
                </div>
                <Button
                  onClick={importWithToken}
                  disabled={isLoading || !magisterBaseUrl || !accessToken}
                  className="w-full gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Ophalen
                </Button>
              </div>
            )}
          </section>

          {(status || error) && (
            <Alert variant={error ? "destructive" : "default"}>
              <AlertDescription>{error || status}</AlertDescription>
            </Alert>
          )}
        </aside>

        <section className="space-y-4">
          {isLoading && courseGroups.length === 0 ? (
            <div className="flex items-center justify-center rounded-md border bg-card p-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : courseGroups.length === 0 ? (
            <div className="rounded-md border bg-card p-8 text-center">
              <h2 className="text-lg font-semibold">Nog geen cijfers geladen</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Open Magister, log in via Magister of Microsoft, en gebruik daarna de
                importlink om je cijfers hier te tonen.
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-3">
              {courseGroups.map((group) => (
                <AccordionItem
                  key={group.course}
                  value={group.course}
                  className="rounded-md border bg-card px-4"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="grid w-full gap-2 pr-4 text-left sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                      <span className="font-semibold">{group.course}</span>
                      <span className="text-sm text-muted-foreground">
                        {group.gradeCount} cijfers
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Gemiddelde: {group.weightedAverage ?? "—"}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {group.latestDisplayDate}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="overflow-x-auto pb-4">
                      <table className="w-full text-sm">
                        <thead className="border-b text-left text-muted-foreground">
                          <tr>
                            <th className="py-2 pr-4 font-medium">Omschrijving</th>
                            <th className="py-2 pr-4 font-medium">Cijfer</th>
                            <th className="py-2 pr-4 font-medium">Weging</th>
                            <th className="py-2 pr-4 font-medium">Datum</th>
                            <th className="py-2 pr-4 font-medium">Periode</th>
                            <th className="py-2 font-medium">Telt mee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.grades.map((grade, index) => (
                            <tr
                              key={`${group.course}-${grade.description}-${grade.date}-${index}`}
                              className={
                                grade.counts
                                  ? "border-b last:border-0"
                                  : "border-b opacity-50 last:border-0"
                              }
                            >
                              <td className="py-3 pr-4">{grade.description || "—"}</td>
                              <td
                                className={
                                  grade.isSufficient
                                    ? "py-3 pr-4 font-semibold text-emerald-700"
                                    : "py-3 pr-4 font-semibold text-red-700"
                                }
                              >
                                {grade.grade}
                              </td>
                              <td className="py-3 pr-4">
                                {grade.weight !== "" ? `${grade.weight}×` : "—"}
                              </td>
                              <td className="py-3 pr-4">{grade.displayDate || "—"}</td>
                              <td className="py-3 pr-4">{grade.period || "—"}</td>
                              <td className="py-3">{grade.counts ? "Ja" : "Nee"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </section>
      </div>
    </main>
  );
}

function normalizeMagisterUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Gebruik een HTTPS Magister URL.");
  if (url.hostname !== "magister.net" && !url.hostname.endsWith(".magister.net")) {
    throw new Error("Gebruik een geldige magister.net URL.");
  }
  return `${url.protocol}//${url.hostname}`;
}
