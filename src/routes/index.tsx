import { createFileRoute } from "@tanstack/react-router";
import { MagisterGradeDashboard } from "@/components/MagisterGradeDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Grutto Grades — Magister cijfers per vak" },
      {
        name: "description",
        content:
          "Importeer en bekijk je Magister cijfers, gegroepeerd per vak met gewogen gemiddelde.",
      },
      { property: "og:title", content: "Grutto Grades" },
      {
        property: "og:description",
        content: "Magister cijfers overzichtelijk per vak, met gewogen gemiddelde.",
      },
    ],
  }),
  component: MagisterGradeDashboard,
});
