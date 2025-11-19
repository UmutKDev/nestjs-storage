import * as fs from 'node:fs';

const WelcomeTemplate = () =>
  fs.readFileSync(__dirname + '/welcome.html', {
    encoding: 'utf-8',
  });

export default WelcomeTemplate;
