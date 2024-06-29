/*
14_illumination_models_ML_TX.frag: as 12_illumination_models_ML.frag, but with texturing

N.B. 1)  "13_illumination_models_ML_TX.vert" must be used as vertex shader

N.B. 2) In this example, we consider point lights only. For different kind of lights, the computation must be changed (for example, a directional light is defined by the direction of incident light, so the lightDir is passed as uniform and not calculated in the shader like in this case with a point light).

N.B. 3)  the different illumination models are implemented using Shaders Subroutines

N.B. 4)  only Blinn-Phong and GGX illumination models are considered in this shader

N.B. 5) see note 2 in the vertex shader for considerations on multiple lights management

author: Davide Gadia

Real-Time Graphics Programming - a.a. 2023/2024
Master degree in Computer Science
Universita' degli Studi di Milano

*/

#version 410 core

// number of lights in the scene
#define NR_LIGHTS 1

const float PI = 3.14159265359;

// output shader variable
out vec4 colorFrag;

// array with lights incidence directions (calculated in vertex shader, interpolated by rasterization)
in vec3 lightDirs[NR_LIGHTS];

// the transformed normal has been calculated per-vertex in the vertex shader
in vec3 vNormal;
// vector from fragment to camera (in view coordinate)
in vec3 vViewPosition;

// interpolated texture coordinates
in vec2 interp_UV;

// texture repetitions
uniform float repeat;

// texture sampler
uniform sampler2D tex;

// ambient and specular components (passed from the application)
uniform vec3 ambientColor;
uniform vec3 specularColor;
// weight of the components
// in this case, we can pass separate values from the main application even if Ka+Kd+Ks>1. In more "realistic" situations, I have to set this sum = 1, or at least Kd+Ks = 1, by passing Kd as uniform, and then setting Ks = 1.0-Kd
uniform float Ka;
uniform float Kd;
uniform float Ks;

// shininess coefficients (passed from the application)
uniform float shininess;

// uniforms for GGX model
uniform float alpha; // rugosity - 0 : smooth, 1: rough
uniform float F0; // fresnel reflectance at normal incidence

////////////////////////////////////////////////////////////////////

// the "type" of the Subroutine
subroutine vec4 ill_model();

// Subroutine Uniform (it is conceptually similar to a C pointer function)
subroutine uniform ill_model Illumination_Model_ML_TX;

////////////////////////////////////////////////////////////////////

//////////////////////////////////////////
// a subroutine for the Blinn-Phong model for multiple lights and texturing
subroutine(ill_model)
vec4 BlinnPhong_ML_TX() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // we repeat the UVs and we sample the texture
    vec2 repeated_UV = mod(interp_UV*repeat, 1.0);
    vec4 surfaceColor = texture(tex, repeated_UV);

    // ambient component can be calculated at the beginning
    vec4 color = vec4(Ka*ambientColor,1.0);

    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);

    //for all the lights in the scene
    for(int i = 0; i < NR_LIGHTS; i++)
    {
        // normalization of the per-fragment light incidence direction
        vec3 L = normalize(lightDirs[i]);

        // Lambert coefficient
        float lambertian = max(dot(L,N), 0.0);

        // if the lambert coefficient is positive, then I can calculate the specular component
        if(lambertian > 0.0)
        {
            // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
            vec3 V = normalize( vViewPosition );

            // in the Blinn-Phong model we do not use the reflection vector, but the half vector
            vec3 H = normalize(L + V);

            // we use H to calculate the specular component
            float specAngle = max(dot(H, N), 0.0);
            // shininess application to the specular component
            float specular = pow(specAngle, shininess);

            // We add diffusive (= color sampled from texture) and specular components to the final color
            // N.B. ): in this implementation, the sum of the components can be different than 1
            color += Kd * lambertian * surfaceColor + vec4(Ks * specular * specularColor,1.0);
        }
    }
    return color;
}
//////////////////////////////////////////

//////////////////////////////////////////
// Schlick-GGX method for geometry obstruction (used by GGX model)
float G1(float angle, float alpha)
{
    // in case of Image Based Lighting, the k factor is different:
    // usually it is set as k=(alpha*alpha)/2
    float r = (alpha + 1.0);
    float k = (r*r) / 8.0;

    float num   = angle;
    float denom = angle * (1.0 - k) + k;

    return num / denom;
}

//////////////////////////////////////////
// a subroutine for the GGX model for multiple lights and texturing
subroutine(ill_model)
vec4 GGX_ML_TX() // this name is the one which is detected by the SetupShaders() function in the main application, and the one used to swap subroutines
{
    // we repeat the UVs and we sample the texture
    vec2 repeated_UV  = mod(interp_UV*repeat, 1.0);
    vec4 surfaceColor = texture(tex, repeated_UV);

    // normalization of the per-fragment normal
    vec3 N = normalize(vNormal);

    // diffusive (Lambert) reflection component
    // I use the value sampled from the texture
    vec3 lambert = (Kd*surfaceColor.rgb)/PI;

    // we initialize the final color
    vec3 color = vec3(0.0);

    //for all the lights in the scene
    for(int i = 0; i < NR_LIGHTS; i++)
    {
        // normalization of the per-fragment light incidence direction
        vec3 L = normalize(lightDirs[i]);

        // cosine angle between direction of light and normal
        float NdotL = max(dot(N, L), 0.0);

        // we initialize the specular component
        vec3 specular = vec3(0.0);

        // if the cosine of the angle between direction of light and normal is positive, then I can calculate the specular component
        if(NdotL > 0.0)
        {
            // the view vector has been calculated in the vertex shader, already negated to have direction from the mesh to the camera
            vec3 V = normalize( vViewPosition );

            // half vector
            vec3 H = normalize(L + V);

            // we implement the components seen in the slides for a PBR BRDF
            // we calculate the cosines and parameters to be used in the different components
            float NdotH = max(dot(N, H), 0.0);
            float NdotV = max(dot(N, V), 0.0);
            float VdotH = max(dot(V, H), 0.0);
            float alpha_Squared = alpha * alpha;
            float NdotH_Squared = NdotH * NdotH;

            // Geometric factor G2
            // Smith’s method (uses Schlick-GGX method for both geometry obstruction and shadowing )
            float G2 = G1(NdotV, alpha)*G1(NdotL, alpha);

            // Rugosity D
            // GGX Distribution
            float D = alpha_Squared;
            float denom = (NdotH_Squared*(alpha_Squared-1.0)+1.0);
            D /= PI*denom*denom;

            // Fresnel reflectance F (approx Schlick)
            vec3 F = vec3(pow(1.0 - VdotH, 5.0));
            F *= (1.0 - F0);
            F += F0;

            // we put everything together for the specular component
            specular = (F * G2 * D) / (4.0 * NdotV * NdotL);

            // the rendering equation is:
            //integral of: BRDF * Li * (cosine angle between N and L)
            // BRDF in our case is: the sum of Lambert and GGX
            // Li is considered as equal to 1: light is white, and we have not applied attenuation. With colored lights, and with attenuation, the code must be modified and the Li factor must be multiplied to finalColor
            color += (lambert + specular)*NdotL;
        }
    }
    return vec4(color,1.0);
}
//////////////////////////////////////////

// main
void main(void)
{
    // we call the pointer function Illumination_Model_ML_TX():
    // the subroutine selected in the main application will be called and executed
    colorFrag = Illumination_Model_ML_TX();
}
