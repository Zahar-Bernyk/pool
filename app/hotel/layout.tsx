import type { Metadata } from 'next';

export const metadata: Metadata = {
  "title": "Бронювання готелю біля Стрия — Підгорецький Маєток",
  "description": "Оберіть дати й забронюйте номер у готелі «Підгорецький Маєток» у Підгірцях біля Стрия.",
  "alternates": {
    "canonical": "https://www.pidgoretskyymaietok.com/hotel"
  }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
