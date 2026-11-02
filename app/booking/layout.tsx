import type { Metadata } from 'next';

export const metadata: Metadata = {
  "title": "Бронювання басейну — Підгорецький Маєток",
  "description": "Онлайн-бронювання місць біля басейну Підгорецького Маєтку у Підгірцях біля Стрия.",
  "alternates": {
    "canonical": "https://www.pidgoretskyymaietok.com/booking"
  }
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
