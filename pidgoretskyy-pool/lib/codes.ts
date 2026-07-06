// Код бронювання у форматі 'PM-####'
export function generateBookingCode(): string {
  return 'PM-' + Math.floor(4830 + Math.random() * 9000);
}
