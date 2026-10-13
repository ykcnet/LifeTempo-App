plugins {
    id("com.android.application")
}

val workspaceRoot = rootProject.projectDir.resolve("..")
val generatedWeb = layout.buildDirectory.dir("generated/lifetempoWeb")
val syncLifeTempoAssets = tasks.register<Sync>("syncLifeTempoAssets") {
    into(generatedWeb)
    from(workspaceRoot) {
        include("index.html", "*.js", "*.css", "*.webmanifest")
        include("vendor/ical.js")
        include("LifeTempo-Icons/source/**")
        into("assets/www")
    }
    from(workspaceRoot.resolve("LifeTempo-Icons/android/res")) {
        include("**/*")
        into("res")
    }
}

android {
    namespace = "com.lifetempo.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lifetempo.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    sourceSets.getByName("main").assets.srcDir(generatedWeb.map { it.dir("assets") })
    sourceSets.getByName("main").res.srcDir(generatedWeb.map { it.dir("res") })
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

tasks.named("preBuild").configure {
    dependsOn(syncLifeTempoAssets)
}