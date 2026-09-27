function keyOf(value) {
  return String(value == null ? '' : value).trim()
}

function uniqueOptions(items, keyField, labelField) {
  const seen = new Set()
  return items.reduce((result, item) => {
    const value = keyOf(item[keyField] || item[labelField])
    const label = keyOf(item[labelField])
    if (!value || !label || seen.has(value)) return result
    seen.add(value)
    result.push({ value, label })
    return result
  }, [])
}

function enabledStructuredRegions(regions) {
  return (regions || []).filter((item) => (
    item && item.enabled !== false && item.province && item.city && item.district
  ))
}

function columnsFor(regions, provinceValue, cityValue) {
  const available = enabledStructuredRegions(regions)
  const provinces = uniqueOptions(available, 'provinceCode', 'province')
  const province = provinces.find((item) => item.value === keyOf(provinceValue)) || provinces[0]
  const provinceRegions = province
    ? available.filter((item) => keyOf(item.provinceCode || item.province) === province.value)
    : []
  const cities = uniqueOptions(provinceRegions, 'cityCode', 'city')
  const city = cities.find((item) => item.value === keyOf(cityValue)) || cities[0]
  const cityRegions = city
    ? provinceRegions.filter((item) => keyOf(item.cityCode || item.city) === city.value)
    : []
  const districts = cityRegions.map((item) => ({
    value: keyOf(item.districtCode || item.code || item.id),
    label: item.district,
    regionId: keyOf(item.id),
    region: item
  }))
  return { columns: [provinces, cities, districts], province, city }
}

function matchSelectedRegion(regions, selected) {
  if (!selected) return null
  const available = enabledStructuredRegions(regions)
  const regionId = keyOf(selected.regionId || selected.id)
  const regionCode = keyOf(selected.regionCode || selected.districtCode || selected.code)
  return available.find((item) => regionId && keyOf(item.id) === regionId)
    || available.find((item) => regionCode && keyOf(item.districtCode || item.code) === regionCode)
    || available.find((item) => (
      keyOf(item.province) === keyOf(selected.province)
      && keyOf(item.city) === keyOf(selected.city)
      && keyOf(item.district) === keyOf(selected.district)
    ))
    || null
}

function buildRegionPicker(regions, selected) {
  const matched = matchSelectedRegion(regions, selected)
  const built = columnsFor(
    regions,
    matched && (matched.provinceCode || matched.province),
    matched && (matched.cityCode || matched.city)
  )
  const provinceIndex = Math.max(0, built.columns[0].findIndex((item) => item.value === keyOf(matched && (matched.provinceCode || matched.province))))
  const cityIndex = Math.max(0, built.columns[1].findIndex((item) => item.value === keyOf(matched && (matched.cityCode || matched.city))))
  const districtIndex = Math.max(0, built.columns[2].findIndex((item) => item.regionId === keyOf(matched && matched.id)))
  return { columns: built.columns, indexes: [provinceIndex, cityIndex, districtIndex], selected: matched }
}

function changeRegionPicker(regions, picker, column, value) {
  const indexes = (picker.indexes || [0, 0, 0]).slice()
  const columns = picker.columns || [[], [], []]
  if (column === 0) {
    const province = columns[0][value]
    const built = columnsFor(regions, province && province.value, '')
    return { columns: built.columns, indexes: [value, 0, 0], selected: null }
  }
  if (column === 1) {
    const province = columns[0][indexes[0]]
    const current = columnsFor(regions, province && province.value, '')
    const city = current.columns[1][value]
    const built = columnsFor(regions, province && province.value, city && city.value)
    return { columns: built.columns, indexes: [indexes[0], value, 0], selected: null }
  }
  indexes[2] = value
  return { columns, indexes, selected: null }
}

function selectedRegion(picker, indexes) {
  const finalIndexes = indexes || picker.indexes || [0, 0, 0]
  const district = (picker.columns && picker.columns[2] || [])[Number(finalIndexes[2])]
  return district ? district.region : null
}

function regionText(region) {
  return region ? `${region.province || ''}${region.city || ''}${region.district || region.name || ''}` : ''
}

module.exports = { buildRegionPicker, changeRegionPicker, selectedRegion, regionText }
