// UNIT test: the qualification Keycloak client uses the right baked dev defaults.
import { describe, it, expect } from "vitest";
import { keycloakConfig } from "@/auth/keycloak";

describe("qualification keycloak config", () => {
  it("defaults to the aisc realm, qualification client, and dev keycloak url", () => {
    expect(keycloakConfig.realm).toBe("aisc");
    expect(keycloakConfig.clientId).toBe("qualification");
    expect(keycloakConfig.url).toBe("http://localhost:8081");
  });
});
