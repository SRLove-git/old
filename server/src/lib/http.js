export function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function wrap(handler) {
  return async (req, res) => {
    try {
      const result = await handler(req, res)
      if (result !== undefined && !res.headersSent) {
        res.json({ code: 0, data: result })
      }
    } catch (error) {
      if (res.headersSent) return
      const status = error && error.status ? error.status : 500
      res.status(status).json({ code: status, message: error.message || '服务器内部错误' })
    }
  }
}
