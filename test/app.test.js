import app from '../bin/app.js';
import request from "supertest";

describe("GET /", () => {

    it("Test our hello world app response",async () => {
       const response =  await request(app).get("/");
        expect(response.text).toBe('Hello World!!!');
    })

})