import type { Metadata } from 'next';

export const metadata: Metadata = {
  "title": "Вакансії — Підгорецький Маєток у Підгірцях",
  "description": "Вакансії у Підгорецькому Маєтку в Підгірцях Стрийського району. Долучайтеся до команди.",
  "alternates": {
    "canonical": "https://www.pidgoretskyymaietok.com/vacancies"
  }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
