plugins {
    id("com.android.application")
}

val workspaceRoot = rootProject.projectDir.resolve("..")
val generatedWeb = layout.buildDirectory.dir("generated/lifetempoWeb")
val signingKeyPath = providers.environmentVariable("LIFETEMPO_SIGNING_KEYSTORE").orNull
val signingStorePassword = providers.environmentVariable("LIFETEMPO_SIGNING_STORE_PASSWORD").orNull
val signingKeyAlias = providers.environmentVariable("LIFETEMPO_SIGNING_KEY_ALIAS").orNull
val signingKeyPassword = providers.environmentVariable("LIFETEMPO_SIGNING_KEY_PASSWORD").orNull
val syncLifeTempoAssets = tasks.register<Sync>("syncLifeTempoAssets") {
    into(generatedWeb)
    from(workspaceRoot) {
        include("index.html", "*.js", "*.css", "*.webmanifest")
        include("vendor/ical.js")
        include("LifeTempo-Icons/source/**")
            into("assets")
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
        applicationId = "com.ykcnet.lifetempo"
        minSdk = 26
        targetSdk = 35
        versionCode = 16
        versionName = "1.1.5"
    }

    signingConfigs {
        if (signingKeyPath != null && signingStorePassword != null && signingKeyAlias != null && signingKeyPassword != null) {
            create("lifeTempoRelease") {
                storeFile = file(signingKeyPath)
                storePassword = signingStorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        getByName("release") {
            signingConfigs.findByName("lifeTempoRelease")?.let { signingConfig = it }
        }
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
