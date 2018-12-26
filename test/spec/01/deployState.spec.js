/**
 * Tests for deployState tasks
 */

describe('deployState tasks', function () {
  this.timeout(60000)

  const now = new Date()
  const model = {
    props: {
      source_defaults: {
        some_default: 'default'
      },
      sources: [
        {
          description: 'Deploy worker state following a GitHub push event',
          // sub_options: {
          // },
          sub_to_subject: 'github.webhook'
        }
      ],
      specs: [{
        owner: 'DendraScience',
        repo: 'dendra-worker-state',
        path: 'deploy/edge/v1/core/agg/build.json',
        ref: 'refs/heads/master'
      }]
    },
    state: {
      _id: 'taskMachine-deployState-current',
      created_at: now,
      updated_at: now
    }
  }

  const eventSubject = 'github.webhook'

  const pushEvent = {
    id: '0cac414a-0963-11e9-85aa-b20c3938340a',
    name: 'push',
    payload: {
      ref: 'refs/heads/master',
      commits: [{
        added: [
        ],
        removed: [
        ],
        modified: [
          'deploy/edge/v1/core/agg/build.json'
        ]
      }],
      repository: {
        name: 'dendra-worker-state',
        owner: {
          name: 'DendraScience'
        }
      }
    }
  }

  Object.defineProperty(model, '$app', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: main.app
  })
  Object.defineProperty(model, 'key', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: 'deployState'
  })
  Object.defineProperty(model, 'private', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: {}
  })

  let tasks
  let machine

  after(function () {
    return Promise.all([
      model.private.stan ? new Promise((resolve, reject) => {
        model.private.stan.removeAllListeners()
        model.private.stan.once('close', resolve)
        model.private.stan.once('error', reject)
        model.private.stan.close()
      }) : Promise.resolve()
    ])
  })

  it('should import', function () {
    tasks = require('../../../dist').deployState

    expect(tasks).to.have.property('sources')
  })

  it('should create machine', function () {
    machine = new tm.TaskMachine(model, tasks, {
      helpers: {
        logger: console
      },
      interval: 500
    })

    expect(machine).to.have.property('model')
  })

  it('should run', function () {
    model.scratch = {}

    return machine.clear().start().then(success => {
      /* eslint-disable-next-line no-unused-expressions */
      expect(success).to.be.true

      // Verify task state
      expect(model).to.have.property('applyReady', true)
      expect(model).to.have.property('sourcesReady', true)
      expect(model).to.have.property('stanCheckReady', false)
      expect(model).to.have.property('stanCloseReady', false)
      expect(model).to.have.property('stanReady', true)
      expect(model).to.have.property('subscriptionsReady', true)
      expect(model).to.have.property('versionTsReady', false)

      // Check for defaults
      expect(model).to.have.nested.property('sources.github_webhook.some_default', 'default')
    })
  })

  it('should get default state', function () {
    return main.app.service('/state/docs').get('agent-build-default').then(doc => {
      expect(doc).to.have.property('_id', 'agent-build-default')
    })
  })

  it('should process push event', function () {
    const msgStr = JSON.stringify(pushEvent)

    return new Promise((resolve, reject) => {
      model.private.stan.publish(eventSubject, msgStr, (err, guid) => err ? reject(err) : resolve(guid))
    })
  })

  it('should wait for 5 seconds', function () {
    return new Promise(resolve => setTimeout(resolve, 5000))
  })

  it('should have specs to apply', function () {
    expect(model).to.have.property('specsToApply').lengthOf(1)
  })

  it('should apply', function () {
    model.scratch = {}

    return machine.clear().start().then(success => {
      /* eslint-disable no-unused-expressions */
      expect(success).to.be.true

      // Verify task state
      expect(model).to.have.property('applyReady', true)
      expect(model).to.have.property('sourcesReady', false)
      expect(model).to.have.property('stanCheckReady', false)
      expect(model).to.have.property('stanCloseReady', false)
      expect(model).to.have.property('stanReady', false)
      expect(model).to.have.property('subscriptionsReady', false)
      expect(model).to.have.property('versionTsReady', false)

      // Verify applied state
      expect(model).to.have.property('specsToApply').lengthOf(0)
    })
  })
})
