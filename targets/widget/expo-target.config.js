/** @type {import('@bacons/apple-targets').Config} */
module.exports = () => ({
  type: 'widget',
  name: 'ConqueRunActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'ActivityKit', 'WidgetKit'],
});
