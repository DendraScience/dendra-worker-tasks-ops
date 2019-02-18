'use strict';

/**
 * Fetch state from a source control repo. Apply as new default state.
 */

// For API docs, see https://octokit.github.io/rest.js
const Octokit = require('@octokit/rest');
const path = require('path');

let octokit;

module.exports = {
  clear(m) {
    if (!m.specsToApply && m.props.specs) m.specsToApply = m.props.specs.slice();
  },

  guard(m) {
    return !m.applyError && m.specsToApply && m.specsToApply.length > 0;
  },

  async execute(m, { logger }) {
    const cfg = m.$app.get('clients').octokit;
    const spec = m.specsToApply[0];
    let doc;

    if (!octokit) {
      const opts = {
        userAgent: 'DendraScience/dendra-worker-tasks-ops'
      };

      if (cfg && cfg.auth && cfg.auth.token) {
        logger.info('Configuring octokit with auth token');
        opts.auth = `token ${cfg.auth.token}`;
      } else {
        logger.info('Configuring octokit without auth!');
      }

      octokit = new Octokit(opts);
    }

    logger.info('Getting contents to apply', { spec });

    try {
      const contents = await octokit.repos.getContents(Object.assign({}, spec));
      const { sha } = contents.data;

      logger.info('Getting blob to apply', { sha, spec });

      const blob = await octokit.git.getBlob({
        owner: spec.owner,
        repo: spec.repo,
        file_sha: sha
      });

      const buf = Buffer.from(blob.data.content, 'base64');
      const data = JSON.parse(buf.toString('utf8'));
      const key = path.basename(spec.path, '.json');
      const agents = m.$app.get('agents');
      const agent = agents[key];

      if (!agent) throw new Error(`No agent found for '${key}'`);

      const currentDocId = `agent-${key}-current`;
      const defaultDocId = `agent-${key}-default`;
      const docService = m.$app.service('/state/docs');

      logger.info(`Updating state doc '${defaultDocId}'`);

      try {
        doc = await docService.update(defaultDocId, Object.assign({
          _id: defaultDocId
        }, data));
      } catch (err) {
        if (err.code !== 404) throw err;

        logger.info(`No state doc found for '${defaultDocId}'`);
      }

      if (!doc) {
        logger.info(`Creating state doc '${defaultDocId}'`);

        doc = await docService.create(Object.assign({
          _id: defaultDocId
        }, data));
      }

      logger.info(`Removing state doc '${currentDocId}'`);

      try {
        await docService.remove(currentDocId);
      } catch (err) {
        if (err.code !== 404) throw err;

        logger.info(`No state doc found for '${currentDocId}'`);
      }
    } catch (err) {
      logger.error('Apply error', err);
      throw err;
    }

    return doc;
  },

  assign(m, res, { logger }) {
    const spec = m.specsToApply.shift();

    logger.info('State applied', { _id: res._id, spec });
  }
};