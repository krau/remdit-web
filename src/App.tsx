import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import EditorPage from "./EditorPage";
import HomePage from "./HomePage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/edit" element={<HomePage />} />
        <Route path="/edit/:id" element={<EditorPage />} />
      </Routes>
    </Router>
  );
}

export default App;
