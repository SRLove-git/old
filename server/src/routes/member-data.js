import { Router } from 'express'
import * as store from '../store.js'
import { wrap } from '../lib/http.js'
import { isAdminRequest, requestUserId, requireRowOwner, requireUser } from '../middleware/auth.js'

const router = Router()

router.get('/participants', wrap((req) => {
  if (isAdminRequest(req)) return store.listParticipants()
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.listParticipants(userId)
}))

router.post('/participants', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.createParticipant(userId, req.body)
}))

router.put('/participants/:id', wrap((req) => {
  requireRowOwner(req, 'participants', req.params.id)
  return store.updateParticipant(req.params.id, req.body)
}))

router.delete('/participants/:id', wrap((req) => {
  requireRowOwner(req, 'participants', req.params.id)
  return store.deleteParticipant(req.params.id)
}))

router.get('/addresses', wrap((req) => {
  if (isAdminRequest(req)) return store.listAddresses()
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.listAddresses(userId)
}))

router.post('/addresses', wrap((req) => {
  const userId = requestUserId(req)
  requireUser(req, userId)
  return store.createAddress(userId, req.body)
}))

router.put('/addresses/:id', wrap((req) => {
  requireRowOwner(req, 'addresses', req.params.id)
  return store.updateAddress(req.params.id, req.body)
}))

router.delete('/addresses/:id', wrap((req) => {
  requireRowOwner(req, 'addresses', req.params.id)
  return store.deleteAddress(req.params.id)
}))

export default router
