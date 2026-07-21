// Код бронювання у форматі 'PM-####'
export function generateBookingCode(): string {
  return 'PM-' + Math.floor(4830 + Math.random() * 9000);
}

// Код бронювання номера готелю у форматі 'HR-####' (Hotel Reservation).
export function generateRoomCode(): string {
  return 'HR-' + Math.floor(4830 + Math.random() * 9000);
}
