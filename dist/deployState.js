"use strict";

module.exports = {
  apply: require('./tasks/deployState/apply'),
  sources: require('./tasks/sources'),
  stan: require('./tasks/stan'),
  stanCheck: require('./tasks/stanCheck'),
  stanClose: require('./tasks/stanClose'),
  subscriptions: require('./tasks/deployState/subscriptions'),
  versionTs: require('./tasks/versionTs')
};