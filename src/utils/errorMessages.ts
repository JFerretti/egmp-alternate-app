// Maps raw error messages to user-friendly text

const ERROR_PATTERNS: [RegExp, string][] = [
  [/network request failed/i, 'Unable to reach server. Check your internet connection.'],
  [/timeout|timed out/i, 'Request timed out. Please try again.'],
  [/login failed|authentication|auth.*fail|invalid.*credentials/i, 'Authentication failed. Please check your credentials.'],
  [/failed to initialize/i, 'Could not connect to vehicle service. Please try again.'],
  [/no vehicle found/i, 'No vehicle found on your account.'],
  [/no vehicle selected/i, 'Please select a vehicle first.'],
  [/failed to get auth code/i, 'Vehicle command authorization failed. Check your PIN.'],
  [/failed to send/i, 'Command could not be sent. Please try again.'],
  [/failed to retrieve/i, 'Could not retrieve vehicle data. Please try again.'],
]

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  for (const [pattern, friendly] of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return friendly
    }
  }

  // Fallback: if the message is short and readable, use it; otherwise generic
  if (message.length < 80 && !message.includes('{') && !message.includes('http')) {
    return message
  }

  return 'Something went wrong. Please try again.'
}
