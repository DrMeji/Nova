import React from 'react';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import Home from './screens/Home';
import Dashboard from './screens/Dashboard';
import Projects from './screens/Projects';
import Profile from './screens/Profile';
import Settings from './screens/Settings';
import Help from './screens/Help';
import Login from './screens/Login';
import Signup from './screens/Signup';
import Logout from './screens/Logout';

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        {/* Navigation bar without logo */}
        <nav>
          <ul>
            <li><a href="/">Home</a></li>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/projects">Projects</a></li>
            <li><a href="/profile">Profile</a></li>
            <li><a href="/settings">Settings</a></li>
            <li><a href="/help">Help</a></li>
            <li><a href="/login">Login</a></li>
            <li><a href="/signup">Signup</a></li>
            <li><a href="/logout">Logout</a></li>
          </ul>
        </nav>

        {/* Main content area */}
        <main>
          <Switch>
            <Route path="/" exact component={Home} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/projects" component={Projects} />
            <Route path="/profile" component={Profile} />
            <Route path="/settings" component={Settings} />
            <Route path="/help" component={Help} />
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route path="/logout" component={Logout} />
          </Switch>
        </main>
      </div>
    </Router>
  );
};

export default App;
