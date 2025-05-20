export function logInfo(message, data = null) {
  console.log(`[INFO] ${message}`);
  if (data) {
    console.log(data);
  }
}

export function logError(message, error = null) {
  console.error(`[ERROR] ${message}`);
  if (error) {
    console.error(error);
  }
}
