const { openContentLink } = require('../../utils/content-link.js')

Component({
  properties: {
    blocks: { type: Array, value: [] },
    fallbackImage: { type: String, value: '' }
  },
  methods: { openContentLink }
})
