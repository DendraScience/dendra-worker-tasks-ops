/**
 * Subscribe to subjects after connected. Add an event listener for messages.
 */

async function processItem (
  { data, dataObj, msgSeq },
  { logger, specs, specsToApply, subSubject }) {
  /*
    Find matching specs to apply based on commits.
   */

  logger.info('Processing item', {
    dataObj: JSON.stringify(dataObj),
    specs: JSON.stringify(specs),
    msgSeq,
    subSubject
  })

  const matchedSpecs = specs.filter(spec => {
    return (dataObj.ref === spec.ref) &&
      dataObj.repository && (dataObj.repository.name === spec.repo) &&
      dataObj.repository.owner && (dataObj.repository.owner.name === spec.owner) &&
      dataObj.commits &&
      dataObj.commits.find(commit => {
        return (commit.added && commit.added.includes(spec.path)) ||
          (commit.modified && commit.modified.includes(spec.path))
      })
  })

  specsToApply.push(...matchedSpecs)

  logger.info('Matched file specs', { matchedSpecs, msgSeq, subSubject })
}

function handleMessage (msg) {
  const { logger, m, subSubject } = this

  if (!msg) {
    logger.error('Message undefined')
    return
  }

  const msgSeq = msg.getSequence()

  logger.info('Message received', { msgSeq, subSubject })

  if (m.subscriptionsTs !== m.versionTs) {
    logger.info('Message deferred', { msgSeq, subSubject })
    return
  }

  try {
    const data = msg.getData()
    const dataObj = JSON.parse(data)

    processItem({ data, dataObj, msgSeq }, this).then(() => msg.ack()).catch(err => {
      logger.error('Message processing error', { msgSeq, subSubject, err, dataObj })
    })
  } catch (err) {
    logger.error('Message error', { msgSeq, subSubject, err })
  }
}

module.exports = {
  guard (m) {
    return !m.subscriptionsError &&
      m.private.stan && m.stanConnected &&
      (m.subscriptionsTs !== m.versionTs) &&
      !m.private.subscriptions
  },

  execute (m, { logger }) {
    const { specsToApply } = m
    const { stan } = m.private
    const { specs } = m.props
    const subs = []

    m.sourceKeys.forEach(sourceKey => {
      const source = m.sources[sourceKey]
      const {
        sub_options: subOptions,
        sub_to_subject: subSubject
      } = source

      try {
        const opts = stan.subscriptionOptions()

        opts.setManualAckMode(true)
        opts.setStartAtTimeDelta(0)
        opts.setMaxInFlight(1)

        if (subOptions) {
          if (typeof subOptions.ack_wait === 'number') opts.setAckWait(subOptions.ack_wait)
          if (typeof subOptions.durable_name === 'string') opts.setDurableName(subOptions.durable_name)
        }

        const sub = (typeof queueGroup === 'string') ? stan.subscribe(subSubject, opts) : stan.subscribe(subSubject, opts)

        sub.on('message', handleMessage.bind({
          logger,
          m,
          specs,
          specsToApply,
          stan,
          subSubject
        }))

        subs.push(sub)
      } catch (err) {
        logger.error('Subscription error', { err, sourceKey, subSubject })
      }
    })

    return subs
  },

  assign (m, res, { logger }) {
    m.private.subscriptions = res
    m.subscriptionsTs = m.versionTs

    logger.info('Subscriptions ready')
  }
}
