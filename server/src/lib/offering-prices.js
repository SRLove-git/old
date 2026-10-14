import { badRequest, round2 } from './domain-values.js'

export function requiredPaidPrice(value, label) {
  const price = round2(value)
  if (price < 0.01) throw badRequest(`${label}最低为0.01元，不能为0元`)
  return price
}

export function optionalDisplayPrice(value, label) {
  const price = round2(value)
  if (price < 0) throw badRequest(`${label}不能小于0元`)
  return price
}

export function normalizePaidOfferingPrices(offering, label, { includeRegularPrice = true } = {}) {
  offering.memberPrice = requiredPaidPrice(offering.memberPrice, `${label}会员价`)
  if (includeRegularPrice) offering.price = requiredPaidPrice(offering.price, `${label}非会员价`)
  if (offering.originalPrice !== undefined) {
    offering.originalPrice = optionalDisplayPrice(offering.originalPrice, `${label}原价`)
  }
  if (Array.isArray(offering.skus)) {
    offering.skus = offering.skus.map((sku, index) => ({
      ...sku,
      memberPrice: requiredPaidPrice(sku.memberPrice, `${label}第${index + 1}个规格会员价`),
      ...(includeRegularPrice
        ? { price: requiredPaidPrice(sku.price, `${label}第${index + 1}个规格非会员价`) }
        : {})
    }))
  }
  return offering
}
