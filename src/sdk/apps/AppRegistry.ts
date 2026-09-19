/**
 * AppRegistry & Multi-App Isolation Manager
 * Defines registered application metadata, schemas, and strict data isolation guarantees.
 */

import { AppRegistration } from "../types";

export class AppRegistry {
  private static registeredApps: Map<string, AppRegistration> = new Map();

  static {
    // 1. Shramik Hisab Pro Application
    this.registerApp({
      appId: "shramik_hisab",
      appName: "Shramik Hisab Pro",
      schemaVersion: 1,
      description: "Laborer & Daily Expense Ledger with encrypted worker attendance & payment tracking.",
      entities: ["workers", "attendance", "payments", "advances", "expenses", "preferences"],
      encryptionRequired: true,
      publicDataSource: "public-data/shramik_categories.json",
    });

    // 2. ResumeCraft Pro Application
    this.registerApp({
      appId: "resume_craft",
      appName: "ResumeCraft Pro",
      schemaVersion: 1,
      description: "Professional Resume & CV Builder with encrypted resume profiles & template settings.",
      entities: ["resumes", "experience", "education", "skills", "settings"],
      encryptionRequired: true,
      publicDataSource: "public-data/resume_templates.json",
    });

    // 3. Docu Sahayak Application (Example Future App)
    this.registerApp({
      appId: "docu_sahayak",
      appName: "Docu Sahayak",
      schemaVersion: 1,
      description: "Encrypted Personal Document Vault & Aadhaar/PAN record organizer.",
      entities: ["documents", "categories", "access_logs"],
      encryptionRequired: true,
    });
  }

  public static registerApp(app: AppRegistration) {
    this.registeredApps.set(app.appId, app);
  }

  public static getApp(appId: string): AppRegistration {
    const app = this.registeredApps.get(appId);
    if (!app) {
      throw new Error(`App Registration Error: Application '${appId}' is not registered in AppRegistry.`);
    }
    return app;
  }

  public static getAllApps(): AppRegistration[] {
    return Array.from(this.registeredApps.values());
  }
}
