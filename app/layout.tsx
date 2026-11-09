import type { Metadata } from "next";
import { Playfair_Display, PT_Serif } from "next/font/google";
import "./globals.css";

/* Шрифты «Журнала ВКР»: заголовки — Playfair Display, текст — PT Serif.
   next/font отдаёт их самохостингом через CSS-переменные, подхватываемые в globals.css */
const playfair = Playfair_Display({
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-journal-display",
  display: "swap",
});

const ptSerif = PT_Serif({
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin", "cyrillic"],
  variable: "--font-journal-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Журналъ ВКР",
  description:
    "Ведомость выпуска: каталогъ темъ, приказы, просмотры, нормоконтроль и защита",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className={`${playfair.variable} ${ptSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}