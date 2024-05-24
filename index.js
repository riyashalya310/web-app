const express = require("express");
const app = express();
app.use(express.json());
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const dbPath = path.join(__dirname, "college.db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen(3000, () => {
      console.log("server is running at port 3000");
    });
  } catch (e) {
    console.log(`error->${e.message}`);
  }
};

initializeDBAndServer();

app.post("/admin-login", async (request, response) => {
  const { admin_name, password } = request.body;
  const query = "SELECT * FROM admin WHERE admin_name = ?";
  try {
    const user = await db.get(query, [admin_name]);
    if (!user) {
      response.status(401).send("Invalid Admin");
      return;
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      response.status(401).send("Invalid admin name or password");
      return;
    }
    const userDetails = { admin_name };
    const token = jwt.sign(userDetails, "MY_TOKEN_ADMIN", { expiresIn: "1h" });
    response.status(200).send({ jwtToken: token });
  } catch (error) {
    console.error("Error:", error);
    response.status(500).send("Internal server error");
  }
});

app.post("/admin-signup", async (request, response) => {
  const { admin_name, password } = request.body;
  const query = `SELECT * FROM admin WHERE admin_name='${admin_name}'`;
  const user = await db.get(query);
  if (user === null) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userDetails = { admin_name };
    const token = jwt.sign(userDetails, "MY_TOKEN_ADMIN", { expiresIn: "1h" });
    const query = `INSERT INTO admin(admin_name,password) VALUES(${admin_name},${hashedPassword})`;
    await db.run(query);
    response.status(200);
    response.send({ msg: "Admin created successfully", jwtToken: token });
  } else {
    response.status(401);
    response.send("Admin already exists");
  }
});

app.post("/student-login", async (request, response) => {
  const { username, password } = request.body;
  const query = "SELECT * FROM students WHERE username = ?";
  try {
    const user = await db.get(query, [username]);
    if (!user) {
      response.status(401).send("Invalid Student");
      return;
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      response.status(401).send("Invalid user name or password");
      return;
    }
    const userDetails = { admin_name };
    const token = jwt.sign(userDetails, "MY_TOKEN_STUDENT", {
      expiresIn: "1h",
    });
    response.status(200).send({ jwtToken: token });
  } catch (error) {
    console.error("Error:", error);
    response.status(500).send("Internal server error");
  }
});

app.post("/student-signup", async (request, response) => {
  const { username, password, enrollmentYear, fieldId } = request.body;
  const query = `SELECT * FROM students WHERE username='${username}'`;
  const user = await db.get(query);
  if (user === null) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const token = jwt.sign({ username }, "MY_TOKEN_STUDENT", {
      expiresIn: "1h",
    });
    const query = `INSERT INTO students(username,password,enrollment_year,field_id) VALUES('${username}','${hashedPassword}',${enrollmentYear},${fieldId})`;
    await db.run(query);
    response.status(200);
    response.send({ msg: "User created successfully", jwtToken: token });
  } else {
    response.status(401);
    response.send("Student already exists");
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_TOKEN_ADMIN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.get("/students-list", authenticateToken, async (reuqest, response) => {
  const query = `SELECT student.id, subjects.name,SUM(marks.marks) FROM students INNER JOIN marks ON marks.student_id=students.id INNER JOIN subjects ON subjects.id=marks.subject_id`;
  const users = await db.all(query);
  if (users.length === 0) {
    response.status(401);
    response.send("No existing students");
  } else {
    response.status(200);
    response.send({ users });
  }
});

app.get('/students-list/:id',authenticateToken,async(request,response)=>{
  const {id}=request.params;
  const query = `SELECT student.id, subjects.name,SUM(marks.marks) FROM students INNER JOIN marks ON marks.student_id=students.id INNER JOIN subjects ON subjects.id=marks.subject_id WHERE students.id=${id} GROUP BY students.id`;
  const users = await db.get(query);
  if (users) {
    response.status(401);
    response.send("No existing students");
  } else {
    response.status(200);
    response.send({ users });
  }
})

app.put(
  "/student-edit-details/:id",
  authenticateToken,
  async (request, response) => {
    const { id } = reuqest.params;
    const {
      username = "",
      password = "",
      newPassword = "",
      enrollmentYear = "",
      fieldId = "",
    } = request.body;
    const query = `SELECT * FROM students WHERE id=${id}`;
    const user = await db.get(query);
    if (user === null) {
      response.status(401);
      response.send("Student does not exists");
    } else {
      if (await bcrypt.compare(password, user.password)) {
        if (username === "") {
          response.status(401);
          response.send("Invalid Username");
        } else {
          const newPasswordHashed = await bcrypt.hash(newPassword, 10);
          const pass = "";
          if (newPassword === "") {
            pass = password;
          } else {
            pass = newPasswordHashed;
          }
          const updateQuery = `UPDATE students SET username='${username}',password='${pass}', enrollment_year=${enrollmentYear},field_id=${fieldId} WHERE id=${id}`;
          await db.run(updateQuery);
          response.status(200);
          response.send("Student updated successfully");
        }
      } else {
        response.status(401);
        response.send("Invalid Password");
      }
    }
  }
);

app.delete(
  "/student-delete/:id",
  authenticateToken,
  async (request, response) => {
    const { id } = request.params;
    const { username } = request.body;
    const query = `SELECT * FROM students WHERE id=${id}`;
    const user = await db.get(query);
    if (user === null) {
      response.status(401);
      response.send("Invalid Student");
    } else {
      const deleteQuery = `DELETE FROM students where id=${id}`;
      await db.run(deleteQuery);
      response.status(200);
      response.send("Student deleted successfully");
    }
  }
);

app.get("/fields-list", authenticateToken, async (request, response) => {
  const query = `SELECT * FROM fields`;
  const fields = await db.all(query);
  if (fields.length === 0) {
    response.status(401);
    response.send("No existing users");
  } else {
    response.status(200);
    response.send({ fields });
  }
});

app.put("/fields/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { name = "" } = request.body;
  const query = `SELECT * FROM fields WHERE id=${id}`;
  const field = await db.get(query);
  if (field === null) {
    response.status(401);
    response.send("Invalid Field");
  } else {
    if (name === "") {
      response.status(401);
      response.send("Invalid Field Name");
    } else {
      const updateQuery = `UPDATE fields SET name='${name}' WHERE id=${id}`;
      await db.run(updateQuery);
      response.status(200);
      response.send("Field updated successfully");
    }
  }
});

app.delete("/fields/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const query = `SELECT * FROM fields WHERE id=${id}`;
  const field = await db.get(query);
  if (field === null) {
    response.status(401);
    response.send("Invalid Field");
  } else {
    const deleteQuery = `DELETE FROM fields where id=${id}`;
    await db.run(deleteQuery);
    response.status(200);
    response.send("Field deleted successfully");
  }
});

app.get("/subjects-list", authenticateToken, async (request, response) => {
  const query = `SELECT * FROM subjects`;
  const subjects = await db.all(query);
  if (subjects.length === 0) {
    response.status(401);
    response.send("No existing subjects");
  } else {
    response.status(200);
    response.send(subjects);
  }
});

app.put("/subjects/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const { name = "", fieldId = 0 } = request.body;
  const query = `SELECT * FROM subjects WHERE id=${id}`;
  const subject = await db.get(query);
  if (subject === null) {
    response.status(401);
    response.send("Invalid Subject");
  } else {
    if (name === "") {
      response.status(401);
      response.send("Invalid Subject Name");
    } else {
      const updateQuery = `UPDATE subjects SET name='${name}',fieldId=${fieldId} WHERE id=${id}`;
      await db.run(updateQuery);
      response.status(200);
      response.send("Subject updated successfully");
    }
  }
});

app.delete("/subjects/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const query = `SELECT * FROM subjects WHERE id=${id}`;
  const subject = await db.get(query);
  if (subject === null) {
    response.status(401);
    response.send("Invalid Subject");
  } else {
    const deleteQuery = `DELETE FROM subjects WHERE id=${id}`;
    await db.run(deleteQuery);
    response.status(200);
    response.send("Subject deleted successfully");
  }
});

app.get("/student/marks/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  const query = `SELECT * FROM  marks WHERE student_id=${id}`;
  const marks = await db.all(query);
  if (marks.length === 0) {
    response.status(401);
    response.send("No marks found");
  } else {
    response.status(200);
    response.send(marks);
  }
});

app.put(
  "/student/:stuid/marks/:subid",
  authenticateToken,
  async (request, response) => {
    const { stuid, subid } = request.params;
    const { marks } = request.body;
    const query = `SELECT * FROM marks WHERE student_id=${stuid} AND subject_id=${subid}`;
    const mark = await db.get(query);
    if (mark === null) {
      response.status(401);
      response.send("Invalid Subject");
    } else {
      const updateQuery = `UPDATE marks SET marks=${marks} WHERE student_id=${stuid} AND subject_id=${subid}`;
      await db.run(updateQuery);
      response.status(200);
      response.send("Marks updated successfully");
    }
  }
);

app.delete(
  "/student/:stuid/marks/:subid",
  authenticateToken,
  async (request, response) => {
    const { stuid, subid } = request.params;
    const query = `SELECT * FROM marks WHERE student_id=${stuid} AND subject_id=${subid}`;
    const mark = await db.get(query);
    if (mark === null) {
      response.status(401);
      response.send("Invalid Subject");
    } else {
      const deleteQuery = `DELETE FROM marks WHERE student_id=${stuid} AND subject_id=${subid}`;
      await db.run(deleteQuery);
      response.status(200);
      response.send("Marks deleted successfully");
    }
  }
);

module.exports = app;
