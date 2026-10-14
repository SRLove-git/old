import areaRows from 'china-area-data/data-array.json'

const rowByCode = new Map(areaRows.map((item) => [String(item.value), item]))
export const areaChildrenByParent = areaRows.reduce((map, item) => {
  const parent = String(item.parent || '86')
  if (!map.has(parent)) map.set(parent, [])
  map.get(parent).push({ label: item.name, value: String(item.value) })
  return map
}, new Map())
export const provinceOptions = areaChildrenByParent.get('86') || []

export const areaName = (code) => rowByCode.get(String(code || ''))?.name || ''
const normalizedName = (name) => String(name || '').replace(/特别行政区|自治区|自治州|市辖区|地区|省|市|区|县|盟/g, '')

export function regionArea(region) {
  if (!region) return { province: '', city: '', district: '', provinceCode: '', cityCode: '', districtCode: '' }
  if (region.provinceCode && region.cityCode && (region.districtCode || region.code)) {
    return {
      province: region.province || areaName(region.provinceCode), city: region.city || areaName(region.cityCode),
      district: region.district || areaName(region.districtCode || region.code), provinceCode: String(region.provinceCode),
      cityCode: String(region.cityCode), districtCode: String(region.districtCode || region.code)
    }
  }
  const target = normalizedName(region.district || region.name)
  const candidates = areaRows.filter((item) => {
    const parent = rowByCode.get(String(item.parent || ''))
    return parent && parent.parent && normalizedName(item.name) === target
  })
  const matched = candidates.find((item) => {
    const city = rowByCode.get(String(item.parent))
    const province = city && rowByCode.get(String(city.parent))
    return province?.name === '广东省'
  }) || candidates[0]
  if (!matched) return { province: region.province || '', city: region.city || '', district: region.district || region.name || '', provinceCode: '', cityCode: '', districtCode: '' }
  const city = rowByCode.get(String(matched.parent))
  const province = city && rowByCode.get(String(city.parent))
  return { province: province?.name || '', city: city?.name || '', district: matched.name, provinceCode: String(province?.value || ''), cityCode: String(city?.value || ''), districtCode: String(matched.value) }
}
