import zxcvbn from 'zxcvbn'

export interface PasswordCheckResult {
  ok: boolean
  errors: string[]
  score: number  // 0-4
}

export function checkPassword(
  password: string,
  userInputs: string[] = []
): PasswordCheckResult {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự')
  }

  const result = zxcvbn(password, userInputs)
  if (result.score < 2) {
    errors.push('Mật khẩu quá yếu. Hãy thêm chữ hoa, số hoặc ký tự đặc biệt')
  }

  return {
    ok: errors.length === 0,
    errors,
    score: result.score,
  }
}
